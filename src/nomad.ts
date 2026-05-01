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

  private async request(path: string): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "X-Nomad-Token": this.token },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Nomad ${res.status}: ${body.slice(0, 500)}`);
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
}
