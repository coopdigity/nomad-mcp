import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { NomadClient } from "./nomad.js";

const client = new NomadClient();

const server = new McpServer({
  name: "mcp-nomad",
  version: "1.0.0",
});

server.tool(
  "list_jobs",
  "List Nomad jobs, optionally filtered by ID prefix.",
  {
    prefix: z.string().optional().describe("Job ID prefix filter (e.g., 'cube-')"),
  },
  async ({ prefix }) => {
    try {
      const result = await client.listJobs(prefix);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "get_job",
  "Get a Nomad job's full configuration: type, status, datacenters, task groups, and tasks.",
  {
    job_id: z.string().describe("Nomad job ID (e.g., 'cube-refresh-bot')"),
  },
  async ({ job_id }) => {
    try {
      const result = await client.getJob(job_id);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "list_allocations",
  "List allocations for a Nomad job, newest first. Each row shows the 8-char alloc prefix, group, client status, desired status, and creation time.",
  {
    job_id: z.string().describe("Nomad job ID"),
  },
  async ({ job_id }) => {
    try {
      const result = await client.listAllocations(job_id);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "get_alloc_status",
  "Get detailed allocation status: client/desired status, node placement, per-task state, restarts, and recent task events with exit codes.",
  {
    alloc_id: z.string().describe("Allocation ID (full UUID or 8-char prefix)"),
  },
  async ({ alloc_id }) => {
    try {
      const result = await client.getAllocStatus(alloc_id);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "get_alloc_logs",
  "Read stdout or stderr from a task in an allocation. Defaults to the last ~50KB of stdout from the end of the log.",
  {
    alloc_id: z.string().describe("Allocation ID"),
    task: z.string().describe("Task name within the allocation (e.g., 'relay')"),
    type: z.enum(["stdout", "stderr"]).optional().default("stdout").describe("Log stream"),
    origin: z.enum(["start", "end"]).optional().default("end").describe("Read from beginning or end of the log"),
    offset: z.number().int().nonnegative().optional().default(50000).describe("Bytes to read from origin"),
  },
  async ({ alloc_id, task, type, origin, offset }) => {
    try {
      const result = await client.getAllocLogs(alloc_id, task, type, origin, offset);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "list_acl_policies",
  "List Nomad ACL policies by name with their descriptions.",
  {},
  async () => {
    try {
      const result = await client.listAclPolicies();
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "get_acl_policy",
  "Get a single ACL policy by name, including its full HCL rules.",
  {
    name: z.string().describe("Policy name (e.g., 'Admin')"),
  },
  async ({ name }) => {
    try {
      const result = await client.getAclPolicy(name);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "list_acl_tokens",
  "List ACL tokens (AccessorIDs only — secrets are not returned). Requires a management token.",
  {},
  async () => {
    try {
      const result = await client.listAclTokens();
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "get_acl_token_self",
  "Show the ACL token currently in use by this MCP server (type, policies, roles, expiration).",
  {},
  async () => {
    try {
      const result = await client.getAclTokenSelf();
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "list_nodes",
  "List all Nomad client nodes with status, node pool, datacenter, scheduling eligibility, and drain state.",
  {},
  async () => {
    try {
      const result = await client.listNodes();
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "get_node",
  "Get detailed status for a single Nomad client node: status, pool, eligibility, resources, detected drivers.",
  {
    node_id: z.string().describe("Node ID (full UUID or 8-char prefix)"),
  },
  async ({ node_id }) => {
    try {
      const result = await client.getNode(node_id);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "list_volumes",
  "List all CSI volumes registered with Nomad: ID, plugin, access mode, scheduling state, current reader/writer counts.",
  {},
  async () => {
    try {
      const result = await client.listVolumes();
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "volume_status",
  "Get full status for a single CSI volume: provider, capacity, current allocations attached.",
  {
    volume_id: z.string().describe("Volume ID"),
  },
  async ({ volume_id }) => {
    try {
      const result = await client.getVolumeStatus(volume_id);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "deregister_volume",
  "Deregister a CSI volume from Nomad. Targets the volume by exact ID (no prefix matching). Use force=true only when the volume has stale claims that won't release.",
  {
    volume_id: z.string().describe("Volume ID (exact match — no prefix resolution)"),
    force: z.boolean().optional().default(false).describe("Force deregister even if Nomad believes claims are still attached"),
  },
  async ({ volume_id, force }) => {
    try {
      const result = await client.deregisterVolume(volume_id, force);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "register_job",
  "Register (or update) a Nomad job from an HCL definition. Equivalent to `nomad job run`. Pass either `path` (preferred) or `hcl`. Original HCL is preserved as the job submission so `nomad job inspect` and the Nomad UI render the source HCL, not the canonicalized JSON.",
  {
    path: z.string().optional().describe("Absolute path to the HCL file to register (preferred — keeps tool calls compact)"),
    hcl: z.string().optional().describe("Full job HCL contents inline (use only if `path` is unavailable)"),
  },
  async ({ path, hcl }) => {
    try {
      if (!path && !hcl) {
        return { content: [{ type: "text", text: "Error: provide either `path` or `hcl`." }], isError: true };
      }
      if (path && hcl) {
        return { content: [{ type: "text", text: "Error: provide only one of `path` or `hcl`, not both." }], isError: true };
      }
      const source = hcl ?? (await readFile(path!, "utf8"));
      const result = await client.registerJobFromHcl(source);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "stop_job",
  "Stop a Nomad job. With purge=true, also removes the job definition (equivalent to `nomad job stop -purge`).",
  {
    job_id: z.string().describe("Nomad job ID"),
    purge: z.boolean().optional().default(false).describe("If true, also purge the job definition"),
  },
  async ({ job_id, purge }) => {
    try {
      const result = await client.stopJob(job_id, purge);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "restart_alloc",
  "Restart a single allocation, optionally a specific task within it.",
  {
    alloc_id: z.string().describe("Allocation ID (full UUID)"),
    task: z.string().optional().describe("Specific task name within the alloc; omit to restart all tasks"),
  },
  async ({ alloc_id, task }) => {
    try {
      const result = await client.restartAlloc(alloc_id, task);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

server.tool(
  "operator_raft_peers",
  "Show the current Nomad server raft configuration — which server is leader, voter status, raft protocol version.",
  {},
  async () => {
    try {
      const result = await client.getRaftPeers();
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
