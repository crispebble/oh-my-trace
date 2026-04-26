# oh-my-trace

`oh-my-trace` (`omt`) collects local AI-agent history into a local SQLite store and exports AI-friendly context packs.

It does not generate retrospectives or summaries. Its job is to make local agent history safely searchable and readable by other AI tools.

## Install

```bash
npm install -g oh-my-trace
omt init
```

The default home directory is:

```text
~/.omt
```

## Commands

```bash
omt init
omt doctor
omt ingest --since 2026-04-01 --source codex,claude,gemini,copilot-cli
omt status
omt query --since 2026-04-01 --format md
omt query --source codex --limit 20 --order desc --format md
omt query --source codex --since 2026-04-01 --until 2026-04-07 --limit 20 --order desc --format md
omt session <session-id> --format json
omt export --since 2026-04-01 --format context-pack
omt mcp
```

`omt query` defaults to newest-first ordering. Use `--order asc` when you need oldest-first output.

`omt status` includes per-source collection counts and the latest ingest runs, so an operator can check what was collected for each agent/source.

Re-running `omt ingest` is idempotent for normalized events. Event IDs are deterministic and stored as primary keys, so duplicate events are ignored; the `eventsInserted` value reports only newly inserted events.

Use `--home <path>` in tests or isolated runs.

## v1 Sources

- Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
- Claude Code: `~/.claude/projects/*/*.jsonl`, `~/.claude/transcripts/*.jsonl`
- Gemini JSON: `~/.gemini/tmp/*/chats/session-*.json`, `logs.json`
- Copilot CLI: `~/.copilot/session-state/*/events.jsonl`

Experimental sources are listed in config but disabled by default.

## Safety

- Source files are never modified.
- Database-like sources must be copied/read-only before deeper parsing.
- Credential-like content is redacted before persistence and export.
- Auth/token/cookie storage paths are excluded.
