# oh-my-trace

`oh-my-trace` is a local-first AI agent history collector.

It stores local AI tool history in a SQLite database and exports AI-friendly context packs. It does not generate retrospectives or summaries.

## Workspace Layout

```text
packages/
  cli/   npm-distributed CLI package (`@oh-my-trace/cli`, command `omt`)
  core/  shared local storage, adapters, redaction, and export logic
  mcp/   npm-distributed MCP package (`@oh-my-trace/mcp`, command `oh-my-trace-mcp`)
docs/    research and planning notes
```

## CLI

```bash
omt init
omt doctor
omt ingest --since 2026-04-26
omt query --source codex --limit 20 --order desc --format md
omt export --since 2026-04-26 --format context-pack
omt agents
```

The separate MCP package exposes the same local store to AI clients. It can
initialize the store, run diagnostics, collect history, query events/sessions,
and export context packs through MCP tools.

Default home:

```text
~/.omt
```

Legacy home `~/.oh-my-trace` is not migrated or modified automatically.

## Development

```bash
npm test
npm run pack:cli:dry-run
npm run pack:mcp:dry-run
```

Remote:

```text
https://github.com/crispebble/oh-my-trace.git
```
