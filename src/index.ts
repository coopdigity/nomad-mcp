import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

const transport = new StdioServerTransport();
await server.connect(transport);
