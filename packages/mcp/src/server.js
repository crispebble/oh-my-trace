import readline from 'node:readline';
import { queryEvents, listSessions, status } from '@oh-my-trace/core/core/storage.js';
import { SUPPORTED_AGENTS } from '@oh-my-trace/core/agents.js';
import { exportContextPack, renderEvents } from '@oh-my-trace/core/exporters/context-pack.js';
import { collectHistory, doctorReport, initializeStore } from '@oh-my-trace/core/operations.js';

const TOOLS = [
  {
    name: 'initialize_store',
    description: 'Initialize the local oh-my-trace home, config, SQLite store, and source registry.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'doctor',
    description: 'Return local oh-my-trace diagnostics, including source roots and SQLite availability.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_agents',
    description: 'List all known AI-agent sources and support status.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_sources',
    description: 'List configured oh-my-trace source adapters and their enabled state.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'ingest_status',
    description: 'Return current local store counts and latest ingest run status.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'collect_history',
    description: 'Collect local AI-agent history into the oh-my-trace SQLite store.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Comma-separated source ids, for example codex,claude,gemini,copilot-cli.' },
        since: { type: 'string', description: 'Inclusive event timestamp lower bound, for example 2026-04-27.' },
        until: { type: 'string', description: 'Inclusive event timestamp upper bound.' }
      }
    }
  },
  {
    name: 'search_events',
    description: 'Search normalized events by source, time range, project, or text.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Comma-separated source ids, for example codex,claude,gemini,copilot-cli.' },
        since: { type: 'string', description: 'Inclusive event timestamp lower bound, for example 2026-04-27 or 2026-04-27T00:00:00+09:00.' },
        until: { type: 'string', description: 'Inclusive event timestamp upper bound.' },
        project: { type: 'string', description: 'Project name or cwd substring.' },
        text: { type: 'string', description: 'Text substring to search in event content.' },
        sessionId: { type: 'string', description: 'Normalized oh-my-trace session id.' },
        limit: { type: 'number', description: 'Maximum events to return, capped at 1000.' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort by event timestamp. Defaults to desc.' },
        format: { type: 'string', enum: ['json', 'markdown', 'md'], description: 'Response format. Defaults to json.' }
      }
    }
  },
  {
    name: 'list_sessions',
    description: 'List normalized sessions by source or session id.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source id, for example codex.' },
        sessionId: { type: 'string', description: 'Normalized oh-my-trace session id.' },
        id: { type: 'string', description: 'Alias for sessionId.' },
        limit: { type: 'number', description: 'Maximum sessions to return, capped at 1000.' }
      }
    }
  },
  {
    name: 'get_session',
    description: 'Return events for a specific normalized session id.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Normalized oh-my-trace session id.' },
        id: { type: 'string', description: 'Alias for sessionId.' },
        limit: { type: 'number', description: 'Maximum events to return, capped at 1000.' }
      }
    }
  },
  {
    name: 'export_context_pack',
    description: 'Create an AI-readable context pack export from normalized events.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Comma-separated source ids.' },
        since: { type: 'string', description: 'Inclusive event timestamp lower bound.' },
        until: { type: 'string', description: 'Inclusive event timestamp upper bound.' },
        project: { type: 'string', description: 'Project name or cwd substring.' },
        text: { type: 'string', description: 'Text substring to search in event content.' },
        limit: { type: 'number', description: 'Maximum events to include.' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort by event timestamp. Defaults to desc.' },
        format: { type: 'string', enum: ['context-pack', 'markdown', 'json'], description: 'Export format. Defaults to context-pack.' }
      }
    }
  }
];

export async function runMcpServer({ homeDir, startupWarnings = [] }) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(homeDir, startupWarnings, request);
      if (!isNotification(request)) {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, result })}\n`);
      }
    } catch (error) {
      if (!request || !isNotification(request)) {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error.message } })}\n`);
      }
    }
  }
}

async function handleRequest(homeDir, startupWarnings, request) {
  if (request.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'oh-my-trace', version: '0.1.1' },
      capabilities: { tools: {} },
      startupWarnings
    };
  }
  if (request.method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (request.method === 'tools/call') {
    const { name, arguments: args = {} } = request.params || {};
    if (name === 'list_agents') {
      return jsonContent(SUPPORTED_AGENTS);
    }
    if (name === 'initialize_store') {
      const store = await initializeStore(homeDir, { continueOnStorageError: true });
      return jsonContent({
        home: store.paths.homeDir,
        config: store.paths.configPath,
        sqlite: store.paths.dbPath,
        warnings: [...startupWarnings, ...store.warnings]
      });
    }
    if (name === 'doctor') {
      const report = await doctorReport(homeDir, { continueOnStorageError: true });
      return jsonContent({ ...report, startupWarnings });
    }
    const store = await initializeStore(homeDir);
    const freshConfig = store.config;
    if (name === 'list_sources') {
      return jsonContent(freshConfig.sources);
    }
    if (name === 'ingest_status') {
      const payload = await status(homeDir);
      return jsonContent({ ...payload, startupWarnings });
    }
    if (name === 'collect_history') {
      return jsonContent(await collectHistory(homeDir, args));
    }
    if (name === 'search_events') {
      const events = await queryEvents(homeDir, args);
      if (args.format === 'markdown' || args.format === 'md') {
        return textContent(await renderEvents(events, 'md'));
      }
      return jsonContent(events);
    }
    if (name === 'list_sessions') {
      const sessionId = args.sessionId || args.session_id || args.id;
      return jsonContent(await listSessions(homeDir, { ...args, sessionId }));
    }
    if (name === 'get_session') {
      const sessionId = args.sessionId || args.session_id || args.id;
      const sessions = await listSessions(homeDir, { sessionId, limit: 1 });
      const events = await queryEvents(homeDir, { sessionId, limit: args.limit || 500 });
      return jsonContent({ session: sessions[0] || null, events });
    }
    if (name === 'export_context_pack') {
      const result = await exportContextPack(homeDir, args, args.format || 'context-pack');
      return jsonContent(result);
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  if (request.method === 'notifications/initialized') {
    return {};
  }
  throw new Error(`Unsupported MCP method: ${request.method}`);
}

function isNotification(request) {
  return !Object.prototype.hasOwnProperty.call(request || {}, 'id');
}

function jsonContent(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function textContent(text) {
  return { content: [{ type: 'text', text }] };
}
