import { resolveHome } from '@oh-my-trace/core/core/paths.js';
import { listSessions, queryEvents, status } from '@oh-my-trace/core/core/storage.js';
import { formatAgentsText, SUPPORTED_AGENTS, supportedAgentIds } from '@oh-my-trace/core/agents.js';
import { exportContextPack, renderEvents } from '@oh-my-trace/core/exporters/context-pack.js';
import { collectHistory, doctorReport, initializeStore } from '@oh-my-trace/core/operations.js';

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
    const { paths } = await initializeStore(homeDir);
    console.log(`Initialized oh-my-trace home: ${paths.homeDir}`);
    console.log(`Config: ${paths.configPath}`);
    console.log(`SQLite: ${paths.dbPath}`);
    return;
  }

  await initializeStore(homeDir);

  if (command === 'doctor') {
    console.log(JSON.stringify(await doctorReport(homeDir), null, 2));
    return;
  }

  if (command === 'ingest') {
    console.log(JSON.stringify(await collectHistory(homeDir, options), null, 2));
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
    npm install -g @oh-my-trace/mcp
    oh-my-trace-mcp
`);
}

function printMcpInstallHelp() {
  console.log(`oh-my-trace MCP server is distributed separately.

Install:
  npm install -g @oh-my-trace/mcp

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
