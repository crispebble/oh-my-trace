# @oh-my-trace/mcp

MCP server for `oh-my-trace`.

Install:

```bash
npm install -g @oh-my-trace/mcp
```

Run:

```bash
oh-my-trace-mcp
```

Generic MCP client config:

```json
{
  "mcpServers": {
    "oh-my-trace": {
      "command": "oh-my-trace-mcp"
    }
  }
}
```

Codex config example:

```toml
[mcp_servers.oh-my-trace]
command = "oh-my-trace-mcp"
```

Codex derives the exposed tool namespace from the server name, so this server is
expected to appear as tools such as `mcp__oh_my_trace__doctor` and
`mcp__oh_my_trace__search_events`. MCP tool discovery can be cached per Codex
session; after installing or changing this server, start a new Codex session
before checking whether the tools are visible.

The server uses the same local home as the CLI:

```text
~/.omt
```

## Tools

- `initialize_store` prepares the local home, config, SQLite store, and source registry.
- `doctor` reports source roots, SQLite availability, and supported agents.
- `list_agents` lists supported and experimental source adapters.
- `list_sources` lists configured sources and enabled state.
- `collect_history` ingests local history with `source`, `since`, and `until` filters.
- `ingest_status` reports store counts and recent ingest runs.
- `search_events`, `list_sessions`, and `get_session` read normalized history.
- `export_context_pack` creates AI-readable exports from collected events.
