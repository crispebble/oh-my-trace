# oh-my-trace-mcp

MCP server for `oh-my-trace`.

Install:

```bash
npm install -g oh-my-trace-mcp
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

The server uses the same local home as the CLI:

```text
~/.omt
```
