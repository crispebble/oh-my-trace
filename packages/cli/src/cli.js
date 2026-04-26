import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { ensureHome, loadConfig } from '@oh-my-trace/core/core/config.js';
import { homePaths, legacyHomeDir, resolveHome } from '@oh-my-trace/core/core/paths.js';
import { initDb, listSessions, persistNormalized, queryEvents, startIngestRun, finishIngestRun, status, upsertSources } from '@oh-my-trace/core/core/storage.js';
import { selectedAdapters } from '@oh-my-trace/core/adapters/index.js';
import { formatAgentsText, SUPPORTED_AGENTS, supportedAgentIds } from '@oh-my-trace/core/agents.js';
import { exportContextPack, renderEvents } from '@oh-my-trace/core/exporters/context-pack.js';

export async function runCli(argv) {
  const { command, options, rest } = parseArgs(argv);
  const homeDir = resolveHome(options.home);

  if (!command || options.help || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'agents') {
    if ((options.format || 'text') === 'json') {
      console.log(JSON.stringify(SUPPORTED_AGENTS, null, 2));
    } else {
      console.log(formatAgentsText());
    }
    return;
  }

  if (command === 'mcp') {
    printMcpInstallHelp();
    return;
  }

  if (command === 'init') {
    const paths = await ensureHome(homeDir);
    const config = await loadConfig(homeDir);
    await initDb(homeDir);
    await upsertSources(homeDir, config);
    console.log(`Initialized oh-my-trace home: ${paths.homeDir}`);
    console.log(`Config: ${paths.configPath}`);
    console.log(`SQLite: ${paths.dbPath}`);
    return;
  }

  const config = await loadConfig(homeDir);
  await initDb(homeDir);
  await upsertSources(homeDir, config);

  if (command === 'doctor') {
    await doctor(homeDir, config);
    return;
  }

  if (command === 'ingest') {
    await ingest(homeDir, config, options);
    return;
  }

  if (command === 'status') {
    console.log(JSON.stringify(await status(homeDir), null, 2));
    return;
  }

  if (command === 'query') {
    const events = await queryEvents(homeDir, options);
    process.stdout.write(await renderEvents(events, options.format || 'json'));
    return;
  }

  if (command === 'session') {
    const sessionId = rest[0] || options.id;
    if (!sessionId) throw new Error('session id is required');
    const sessions = await listSessions(homeDir, { sessionId, limit: 1 });
    const events = await queryEvents(homeDir, { sessionId, limit: options.limit || 500 });
    if ((options.format || 'json') === 'md') {
      console.log(`# Session ${sessionId}\n`);
      console.log(JSON.stringify(sessions[0] || {}, null, 2));
      process.stdout.write(await renderEvents(events, 'md'));
    } else {
      console.log(JSON.stringify({ session: sessions[0] || null, events }, null, 2));
    }
    return;
  }

  if (command === 'export') {
    const result = await exportContextPack(homeDir, options, options.format || 'context-pack');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function doctor(homeDir, config) {
  const paths = homePaths(homeDir);
  const sqlite = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
  const legacyHomePath = legacyHomeDir();
  let legacyHomeExists = false;
  try {
    await fs.access(legacyHomePath);
    legacyHomeExists = true;
  } catch {
    legacyHomeExists = false;
  }
  const sourceRows = [];
  for (const [id, source] of Object.entries(config.sources)) {
    const roots = [];
    for (const root of source.roots || []) {
      const expanded = root.replace(/^~(?=\/|$)/, process.env.HOME || '');
      let exists = false;
      try {
        await fs.access(expanded);
        exists = true;
      } catch {
        exists = false;
      }
      roots.push({ root, exists });
    }
    sourceRows.push({ id, enabled: source.enabled, experimental: Boolean(source.experimental), roots });
  }
  console.log(JSON.stringify({
    home: paths.homeDir,
    config: paths.configPath,
    legacyHome: {
      path: legacyHomePath,
      exists: legacyHomeExists,
      note: legacyHomeExists ? 'Legacy home exists; it is not migrated or modified automatically.' : null
    },
    sqlite: sqlite.status === 0 ? sqlite.stdout.trim() : 'missing',
    supportedAgents: SUPPORTED_AGENTS,
    sources: sourceRows
  }, null, 2));
}

async function ingest(homeDir, config, options) {
  const adapters = selectedAdapters(config, options.source);
  const runId = await startIngestRun(homeDir, options);
  const summary = { filesSeen: 0, eventsSeen: 0, eventsInserted: 0, errors: 0 };
  try {
    for (const adapter of adapters) {
      const normalized = await adapter.ingest(config, options);
      const persisted = await persistNormalized(homeDir, normalized);
      summary.filesSeen += normalized.filesSeen;
      summary.eventsSeen += normalized.eventsSeen;
      summary.eventsInserted += persisted.insertedEvents;
      summary.errors += normalized.errors;
    }
    await finishIngestRun(homeDir, runId, summary);
    console.log(JSON.stringify({ runId, adapters: adapters.map((adapter) => adapter.id), ...summary }, null, 2));
  } catch (error) {
    summary.errors += 1;
    await finishIngestRun(homeDir, runId, summary);
    throw error;
  }
}

function parseArgs(argv) {
  const options = {};
  const rest = [];
  let command = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    } else {
      rest.push(arg);
    }
  }
  return { command, options, rest };
}

function printHelp() {
  console.log(`oh-my-trace (omt)

Usage:
  omt init [--home <path>]
  omt doctor [--home <path>]
  omt agents [--format json]
  omt ingest [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--source ${supportedAgentIds().join(',')}]
  omt status [--home <path>]
  omt query [--since ...] [--until ...] [--source ...] [--project ...] [--text ...] [--order asc|desc] [--format json|md]
  omt query --source codex --limit 20 --order desc --format md
  omt query --source codex --since 2026-04-26 --until 2026-04-27 --limit 20 --order desc --format md
  omt session <id> [--format json|md]
  omt export [--since ...] [--until ...] [--format context-pack|markdown|json|timeline-json]
  omt mcp

Defaults:
  home: ~/.omt
  query order: desc

${formatAgentsText()}

MCP:
  Install the MCP server separately:
    npm install -g oh-my-trace-mcp
    oh-my-trace-mcp
`);
}

function printMcpInstallHelp() {
  console.log(`oh-my-trace MCP server is distributed separately.

Install:
  npm install -g oh-my-trace-mcp

Run:
  oh-my-trace-mcp

Generic MCP client config:
{
  "mcpServers": {
    "oh-my-trace": {
      "command": "oh-my-trace-mcp"
    }
  }
}
`);
}
