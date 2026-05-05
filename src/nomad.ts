interface JobSummary {
  ID: string;
  Name: string;
  Type: string;
  Status: string;
  StatusDescription?: string;
  Priority: number;
  Datacenters: string[];
  JobSummary?: {
    Children?: { Pending: number; Running: number; Dead: number };
  };
}

interface AllocSummary {
  ID: string;
  Name: string;
  TaskGroup: string;
  ClientStatus: string;
  DesiredStatus: string;
  TaskStates?: Record<string, TaskState>;
  CreateTime: number;
  ModifyTime: number;
}

interface TaskEvent {
  Type: string;
  Time: number;
  DisplayMessage?: string;
  Message?: string;
  ExitCode?: number;
  Signal?: number;
}

interface TaskState {
  State: string;
  Failed: boolean;
  StartedAt?: string;
  FinishedAt?: string;
  Restarts?: number;
  Events?: TaskEvent[];
}

export class NomadClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    const url = process.env.NOMAD_ADDR ?? "http://services.coopdigity.internal:4646";
    const token = process.env.NOMAD_TOKEN;

    if (!token) {
      throw new Error("NOMAD_TOKEN must be set");
    }

    this.baseUrl = url.replace(/\/+$/, "");
    this.token = token;
  }

  private async request(
    path: string,
    opts: { method?: string; body?: unknown } = {},
  ): Promise<Response> {
    const { method = "GET", body } = opts;
    const headers: Record<string, string> = { "X-Nomad-Token": this.token };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Nomad ${res.status}: ${text.slice(0, 500)}`);
    }

    return res;
  }

  async listJobs(prefix?: string): Promise<string> {
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    const res = await this.request(`/v1/jobs${qs}`);
    const jobs = (await res.json()) as JobSummary[];

    if (!jobs.length) return "No jobs found.";

    return jobs
      .map((j) => {
        const status = j.StatusDescription ? `${j.Status} (${j.StatusDescription})` : j.Status;
        return `${j.ID} [${j.Type}] — ${status}`;
      })
      .join("\n");
  }

  async getJob(jobId: string): Promise<string> {
    const res = await this.request(`/v1/job/${encodeURIComponent(jobId)}`);
    const data = (await res.json()) as Record<string, unknown>;

    const lines: string[] = [];
    lines.push(`Job: ${data.ID}`);
    lines.push(`Type: ${data.Type}`);
    lines.push(`Status: ${data.Status}${data.StatusDescription ? ` (${data.StatusDescription})` : ""}`);
    lines.push(`Datacenters: ${(data.Datacenters as string[] | undefined)?.join(", ") ?? ""}`);
    lines.push(`Priority: ${data.Priority}`);
    lines.push(`Stop: ${data.Stop}`);
    lines.push(`Version: ${data.Version}`);
    lines.push(`SubmitTime: ${data.SubmitTime ? new Date((data.SubmitTime as number) / 1e6).toISOString() : ""}`);

    const groups = data.TaskGroups as Array<{ Name: string; Count: number; Tasks: Array<{ Name: string; Driver: string }> }> | undefined;
    if (groups?.length) {
      lines.push("\nTask Groups:");
      for (const g of groups) {
        lines.push(`  ${g.Name} (count=${g.Count})`);
        for (const t of g.Tasks ?? []) {
          lines.push(`    - ${t.Name} [${t.Driver}]`);
        }
      }
    }

    return lines.join("\n");
  }

  async listAllocations(jobId: string): Promise<string> {
    const res = await this.request(`/v1/job/${encodeURIComponent(jobId)}/allocations`);
    const allocs = (await res.json()) as AllocSummary[];

    if (!allocs.length) return "No allocations found.";

    // Newest first
    allocs.sort((a, b) => b.ModifyTime - a.ModifyTime);

    return allocs
      .map((a) => {
        const created = new Date(a.CreateTime / 1e6).toISOString();
        return `${a.ID.slice(0, 8)}  ${a.TaskGroup}  client=${a.ClientStatus}  desired=${a.DesiredStatus}  created=${created}`;
      })
      .join("\n");
  }

  async getAllocStatus(allocId: string): Promise<string> {
    const res = await this.request(`/v1/allocation/${encodeURIComponent(allocId)}`);
    const data = (await res.json()) as Record<string, unknown>;

    const lines: string[] = [];
    lines.push(`Alloc: ${data.ID}`);
    lines.push(`Job: ${data.JobID} (v${data.JobVersion})`);
    lines.push(`Group: ${data.TaskGroup}`);
    lines.push(`ClientStatus: ${data.ClientStatus}${data.ClientDescription ? ` — ${data.ClientDescription}` : ""}`);
    lines.push(`DesiredStatus: ${data.DesiredStatus}${data.DesiredDescription ? ` — ${data.DesiredDescription}` : ""}`);
    lines.push(`Node: ${data.NodeName} (${data.NodeID})`);

    const taskStates = data.TaskStates as Record<string, TaskState> | undefined;
    if (taskStates) {
      for (const [taskName, state] of Object.entries(taskStates)) {
        lines.push(`\nTask: ${taskName}`);
        lines.push(`  State: ${state.State}${state.Failed ? " (FAILED)" : ""}`);
        if (state.Restarts !== undefined) lines.push(`  Restarts: ${state.Restarts}`);
        if (state.StartedAt) lines.push(`  StartedAt: ${state.StartedAt}`);
        if (state.FinishedAt) lines.push(`  FinishedAt: ${state.FinishedAt}`);

        if (state.Events?.length) {
          lines.push(`  Events (${state.Events.length}):`);
          // Show last 10 events
          for (const ev of state.Events.slice(-10)) {
            const ts = new Date(ev.Time / 1e6).toISOString();
            const msg = ev.DisplayMessage ?? ev.Message ?? "";
            const exit = ev.ExitCode !== undefined ? ` exit=${ev.ExitCode}` : "";
            lines.push(`    ${ts}  ${ev.Type}${exit}  ${msg}`);
          }
        }
      }
    }

    return lines.join("\n");
  }

  async getAllocLogs(
    allocId: string,
    task: string,
    type: "stdout" | "stderr" = "stdout",
    origin: "start" | "end" = "end",
    offset = 50000,
  ): Promise<string> {
    const params = new URLSearchParams({
      task,
      type,
      plain: "true",
      origin,
      offset: String(offset),
    });
    const res = await this.request(`/v1/client/fs/logs/${encodeURIComponent(allocId)}?${params}`);
    const text = await res.text();
    return text || "(no log output)";
  }

  async listAclPolicies(): Promise<string> {
    const res = await this.request("/v1/acl/policies");
    const policies = (await res.json()) as Array<{ Name: string; Description?: string; ModifyIndex: number }>;

    if (!policies.length) return "No ACL policies found.";

    return policies
      .map((p) => `${p.Name}${p.Description ? `  — ${p.Description}` : ""}`)
      .join("\n");
  }

  async getAclPolicy(name: string): Promise<string> {
    const res = await this.request(`/v1/acl/policy/${encodeURIComponent(name)}`);
    const data = (await res.json()) as { Name: string; Description?: string; Rules: string; ModifyIndex: number };

    return [
      `Name: ${data.Name}`,
      `Description: ${data.Description ?? "(none)"}`,
      `ModifyIndex: ${data.ModifyIndex}`,
      "",
      "Rules:",
      data.Rules,
    ].join("\n");
  }

  async listAclTokens(): Promise<string> {
    const res = await this.request("/v1/acl/tokens");
    const tokens = (await res.json()) as Array<{
      AccessorID: string;
      Name: string;
      Type: string;
      Policies?: string[];
      Roles?: Array<{ Name: string }>;
      Global: boolean;
    }>;

    if (!tokens.length) return "No ACL tokens found.";

    return tokens
      .map((t) => {
        const policies = (t.Policies ?? []).join(",") || "(none)";
        const roles = (t.Roles ?? []).map((r) => r.Name).join(",") || "(none)";
        return `${t.AccessorID}  type=${t.Type}  global=${t.Global}  name=${t.Name || "(unnamed)"}  policies=[${policies}]  roles=[${roles}]`;
      })
      .join("\n");
  }

  async getAclTokenSelf(): Promise<string> {
    const res = await this.request("/v1/acl/token/self");
    const data = (await res.json()) as Record<string, unknown>;

    return [
      `AccessorID: ${data.AccessorID}`,
      `Name: ${data.Name || "(unnamed)"}`,
      `Type: ${data.Type}`,
      `Global: ${data.Global}`,
      `Policies: ${((data.Policies as string[] | undefined) ?? []).join(", ") || "(none)"}`,
      `Roles: ${((data.Roles as Array<{ Name: string }> | undefined) ?? []).map((r) => r.Name).join(", ") || "(none)"}`,
      `CreateTime: ${data.CreateTime}`,
      `ExpirationTime: ${data.ExpirationTime ?? "(never)"}`,
    ].join("\n");
  }

  async listNodes(): Promise<string> {
    const res = await this.request("/v1/nodes");
    const nodes = (await res.json()) as Array<{
      ID: string;
      Name: string;
      Status: string;
      Datacenter: string;
      NodePool?: string;
      SchedulingEligibility: string;
      Drain: boolean;
      Address: string;
      Version: string;
    }>;

    if (!nodes.length) return "No nodes found.";

    return nodes
      .map((n) => {
        const drain = n.Drain ? " DRAINING" : "";
        return `${n.ID.slice(0, 8)}  ${n.Name}  pool=${n.NodePool ?? "default"}  dc=${n.Datacenter}  status=${n.Status}  eligible=${n.SchedulingEligibility}${drain}  v${n.Version}  addr=${n.Address}`;
      })
      .join("\n");
  }

  async getNode(nodeId: string): Promise<string> {
    const res = await this.request(`/v1/node/${encodeURIComponent(nodeId)}`);
    const data = (await res.json()) as Record<string, unknown>;

    const drivers = (data.Drivers as Record<string, { Detected: boolean; Healthy: boolean }> | undefined) ?? {};
    const driverList = Object.entries(drivers)
      .filter(([, d]) => d.Detected)
      .map(([name, d]) => `${name}${d.Healthy ? "" : "(unhealthy)"}`)
      .join(", ");

    const resources = data.NodeResources as
      | { Cpu?: { CpuShares: number }; Memory?: { MemoryMB: number }; Disk?: { DiskMB: number } }
      | undefined;

    return [
      `Node: ${data.ID}`,
      `Name: ${data.Name}`,
      `Status: ${data.Status}${data.StatusDescription ? ` — ${data.StatusDescription}` : ""}`,
      `Datacenter: ${data.Datacenter}`,
      `NodePool: ${data.NodePool ?? "default"}`,
      `NodeClass: ${data.NodeClass || "(none)"}`,
      `Address: ${data.Address}  Version: ${data.Version}`,
      `SchedulingEligibility: ${data.SchedulingEligibility}`,
      `Drain: ${data.Drain}`,
      `Resources: cpu=${resources?.Cpu?.CpuShares ?? "?"} memory=${resources?.Memory?.MemoryMB ?? "?"}MB disk=${resources?.Disk?.DiskMB ?? "?"}MB`,
      `Drivers: ${driverList || "(none detected)"}`,
    ].join("\n");
  }

  async listVolumes(): Promise<string> {
    const res = await this.request("/v1/volumes?type=csi");
    const vols = (await res.json()) as Array<{
      ID: string;
      Name: string;
      Namespace: string;
      PluginID: string;
      AccessMode: string;
      AttachmentMode: string;
      Schedulable: boolean;
      CurrentReaders: number;
      CurrentWriters: number;
    }>;

    if (!vols.length) return "No CSI volumes found.";

    return vols
      .map(
        (v) =>
          `${v.ID}  name=${v.Name}  ns=${v.Namespace}  plugin=${v.PluginID}  ${v.AccessMode}/${v.AttachmentMode}  schedulable=${v.Schedulable}  readers=${v.CurrentReaders}  writers=${v.CurrentWriters}`,
      )
      .join("\n");
  }

  async getVolumeStatus(volumeId: string): Promise<string> {
    const res = await this.request(`/v1/volume/csi/${encodeURIComponent(volumeId)}`);
    const data = (await res.json()) as Record<string, unknown>;

    const allocs = (data.Allocations as Array<{ ID: string; Name: string; ClientStatus: string }> | undefined) ?? [];

    const lines = [
      `Volume: ${data.ID}`,
      `Name: ${data.Name}`,
      `Namespace: ${data.Namespace}`,
      `PluginID: ${data.PluginID}`,
      `Provider: ${data.Provider}`,
      `AccessMode: ${data.AccessMode}`,
      `AttachmentMode: ${data.AttachmentMode}`,
      `Schedulable: ${data.Schedulable}`,
      `Capacity: ${data.Capacity}`,
      `Readers: ${data.CurrentReaders}  Writers: ${data.CurrentWriters}`,
    ];

    if (allocs.length) {
      lines.push("", "Allocations:");
      for (const a of allocs) {
        lines.push(`  ${a.ID.slice(0, 8)}  ${a.Name}  ${a.ClientStatus}`);
      }
    }

    return lines.join("\n");
  }

  async registerJobFromHcl(hcl: string): Promise<string> {
    const parseRes = await this.request("/v1/jobs/parse", {
      method: "POST",
      body: { JobHCL: hcl, Canonicalize: true },
    });
    const job = (await parseRes.json()) as Record<string, unknown>;

    const regRes = await this.request("/v1/jobs", {
      method: "POST",
      body: { Job: job },
    });
    const data = (await regRes.json()) as { EvalID?: string; JobModifyIndex?: number; Warnings?: string };

    const lines = [
      `Registered job: ${job.ID ?? "(unknown)"}`,
      `EvalID: ${data.EvalID ?? "(none)"}`,
      `JobModifyIndex: ${data.JobModifyIndex ?? "(none)"}`,
    ];
    if (data.Warnings) lines.push(`Warnings: ${data.Warnings}`);
    return lines.join("\n");
  }

  async stopJob(jobId: string, purge = false): Promise<string> {
    const qs = purge ? "?purge=true" : "";
    const res = await this.request(`/v1/job/${encodeURIComponent(jobId)}${qs}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { EvalID?: string };
    return `Stopped${purge ? " and purged" : ""} ${jobId}. EvalID=${data.EvalID ?? "(none)"}`;
  }

  async restartAlloc(allocId: string, taskName?: string): Promise<string> {
    const body = taskName ? { TaskName: taskName } : {};
    await this.request(`/v1/client/allocation/${encodeURIComponent(allocId)}/restart`, {
      method: "POST",
      body,
    });
    return `Restart requested for alloc ${allocId.slice(0, 8)}${taskName ? ` (task=${taskName})` : ""}.`;
  }

  async getRaftPeers(): Promise<string> {
    const res = await this.request("/v1/operator/raft/configuration");
    const data = (await res.json()) as {
      Servers: Array<{ ID: string; Node: string; Address: string; Leader: boolean; Voter: boolean; RaftProtocol: string }>;
      Index: number;
    };

    if (!data.Servers?.length) return "No raft peers found.";

    const lines = [`Raft Index: ${data.Index}`, ""];
    for (const s of data.Servers) {
      const tags: string[] = [];
      if (s.Leader) tags.push("LEADER");
      if (s.Voter) tags.push("voter");
      lines.push(`${s.Node}  ${s.Address}  proto=${s.RaftProtocol}  [${tags.join(",")}]`);
    }
    return lines.join("\n");
  }
}
