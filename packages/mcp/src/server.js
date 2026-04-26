import readline from 'node:readline';
import { queryEvents, listSessions, status } from '@oh-my-trace/core/core/storage.js';
import { exportContextPack } from '@oh-my-trace/core/exporters/context-pack.js';

const TOOLS = [
  {
    name: 'list_sources',
    description: 'List configured oh-my-trace source adapters and their enabled state.'
  },
  {
    name: 'ingest_status',
    description: 'Return current local store counts and latest ingest run status.'
  },
  {
    name: 'search_events',
    description: 'Search normalized events by source, time range, project, or text.'
  },
  {
    name: 'get_session',
    description: 'Return events for a specific normalized session id.'
  },
  {
    name: 'export_context_pack',
    description: 'Create an AI-readable context pack export from normalized events.'
  }
];

export async function runMcpServer({ homeDir, config }) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      const result = await handleRequest(homeDir, config, request);
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, result })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error.message } })}\n`);
    }
  }
}

async function handleRequest(homeDir, config, request) {
  if (request.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'oh-my-trace', version: '0.1.0' },
      capabilities: { tools: {} }
    };
  }
  if (request.method === 'tools/list') {
    return { tools: TOOLS.map((tool) => ({ ...tool, inputSchema: { type: 'object', properties: {} } })) };
  }
  if (request.method === 'tools/call') {
    const { name, arguments: args = {} } = request.params || {};
    if (name === 'list_sources') {
      return { content: [{ type: 'text', text: JSON.stringify(config.sources, null, 2) }] };
    }
    if (name === 'ingest_status') {
      return { content: [{ type: 'text', text: JSON.stringify(await status(homeDir), null, 2) }] };
    }
    if (name === 'search_events') {
      return { content: [{ type: 'text', text: JSON.stringify(await queryEvents(homeDir, args), null, 2) }] };
    }
    if (name === 'get_session') {
      const sessionId = args.sessionId || args.session_id || args.id;
      const sessions = await listSessions(homeDir, { sessionId, limit: 1 });
      const events = await queryEvents(homeDir, { sessionId, limit: args.limit || 500 });
      return { content: [{ type: 'text', text: JSON.stringify({ session: sessions[0] || null, events }, null, 2) }] };
    }
    if (name === 'export_context_pack') {
      const result = await exportContextPack(homeDir, args, args.format || 'context-pack');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  if (request.method === 'notifications/initialized') {
    return {};
  }
  throw new Error(`Unsupported MCP method: ${request.method}`);
}
