# nomad-mcp

Model Context Protocol server exposing Nomad APIs to Claude Code. Read tools require a token with read capability; write tools (`register_job`, `stop_job`, `restart_alloc`) require correspondingly broader capability or a management token.

Modeled on `jenkins-mcp`. TypeScript, stdio transport, official `@modelcontextprotocol/sdk`.

## Tools

### Jobs & allocations (read)
- `list_jobs` — list jobs, optional ID prefix filter.
- `get_job` — full job config (task groups, tasks, status).
- `list_allocations` — allocs for a job, newest first.
- `get_alloc_status` — alloc detail with task events and exit codes.
- `get_alloc_logs` — stdout/stderr for a task; tail or head, configurable byte window.

### Jobs & allocations (write)
- `register_job` — register/update a job from HCL contents.
- `stop_job` — stop a job, optionally purge its definition.
- `restart_alloc` — restart an allocation, or a single task within it.

### ACL
- `list_acl_policies` — list policy names + descriptions.
- `get_acl_policy` — full HCL rules for a policy by name.
- `list_acl_tokens` — list tokens by AccessorID (requires management token).
- `get_acl_token_self` — show the token this MCP server is authed with.

### Cluster
- `list_nodes` — all client nodes: pool, dc, status, eligibility, drain.
- `get_node` — detailed status for a node, including resources and drivers.
- `list_volumes` — CSI volumes with reader/writer counts.
- `volume_status` — full status for a single CSI volume.
- `operator_raft_peers` — server raft config (leader, voters, protocol version).

## Build

```sh
cd F:\ReSight\nomad-mcp
npm install
npm run build
```

## Configure in Claude Code

Add to `~/.claude.json` under `mcpServers` (or your MCP config of choice):

```json
{
  "mcpServers": {
    "nomad": {
      "command": "node",
      "args": ["F:\\ReSight\\nomad-mcp\\dist\\index.js"],
      "env": {
        "NOMAD_ADDR": "http://services.coopdigity.internal:4646",
        "NOMAD_TOKEN": "<your-nomad-token>"
      }
    }
  }
}
```

`NOMAD_ADDR` defaults to `http://services.coopdigity.internal:4646` if omitted.

## Restart Claude Code after editing the config so it picks up the new server.
