import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const bin = path.join(root, 'bin', 'omt.js');
const workspaceRoot = path.resolve(root, '..', '..');
const mcpBin = path.join(workspaceRoot, 'packages', 'mcp', 'bin', 'oh-my-trace-mcp.js');

async function initFixtureHome() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omt-home-'));
  const fixture = path.join(root, 'test', 'fixtures');
  const init = spawnSync(process.execPath, [bin, 'init', '--home', home], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  const configPath = path.join(home, 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  config.sources.codex.roots = [path.join(fixture, 'codex')];
  config.sources.claude.roots = [path.join(fixture, 'claude')];
  config.sources.gemini.roots = [path.join(fixture, 'gemini', 'tmp')];
  config.sources['copilot-cli'].roots = [path.join(fixture, 'copilot', 'session-state')];
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return home;
}

test('init creates package-named home structure', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omt-home-'));
  const result = spawnSync(process.execPath, [bin, 'init', '--home', home], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  await fs.access(path.join(home, 'config.json'));
  await fs.access(path.join(home, 'storage.sqlite'));
  await fs.access(path.join(home, 'exports'));
  const config = JSON.parse(await fs.readFile(path.join(home, 'config.json'), 'utf8'));
  assert.equal(config.packageName, 'oh-my-trace');
  assert.equal(config.commandName, 'omt');
});

test('default home uses ~/.omt and reports legacy home without migration', async () => {
  const fakeUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'omt-user-home-'));
  await fs.mkdir(path.join(fakeUserHome, '.oh-my-trace'), { recursive: true });
  const env = { ...process.env, HOME: fakeUserHome };
  delete env.OMT_HOME;
  const init = spawnSync(process.execPath, [bin, 'init'], {
    encoding: 'utf8',
    env
  });
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, new RegExp(`${escapeRegExp(path.join(fakeUserHome, '.omt'))}`));
  await fs.access(path.join(fakeUserHome, '.omt', 'config.json'));

  const doctor = spawnSync(process.execPath, [bin, 'doctor'], {
    encoding: 'utf8',
    env
  });
  assert.equal(doctor.status, 0, doctor.stderr);
  const payload = JSON.parse(doctor.stdout);
  assert.equal(payload.home, path.join(fakeUserHome, '.omt'));
  assert.equal(payload.legacyHome.exists, true);
  assert.equal(payload.legacyHome.path, path.join(fakeUserHome, '.oh-my-trace'));
});

test('ingest, query, and export fixture data', async () => {
  const home = await initFixtureHome();

  const ingest = spawnSync(process.execPath, [bin, 'ingest', '--home', home, '--since', '2026-04-26'], { encoding: 'utf8' });
  assert.equal(ingest.status, 0, ingest.stderr);
  const ingestJson = JSON.parse(ingest.stdout);
  assert.equal(ingestJson.filesSeen, 4);
  assert.ok(ingestJson.eventsSeen >= 10);
  assert.ok(ingestJson.eventsInserted >= 10);

  const query = spawnSync(process.execPath, [bin, 'query', '--home', home, '--text', 'hello', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(query.status, 0, query.stderr);
  const events = JSON.parse(query.stdout);
  assert.ok(events.length >= 4);
  assert.equal(query.stdout.includes('sk-abcdefghijklmnopqrstuvwxyz'), false);

  const exported = spawnSync(process.execPath, [bin, 'export', '--home', home, '--since', '2026-04-26', '--format', 'context-pack'], { encoding: 'utf8' });
  assert.equal(exported.status, 0, exported.stderr);
  const exportedJson = JSON.parse(exported.stdout);
  await fs.access(exportedJson.filePath);
});

test('help and agents expose supported agents', async () => {
  const help = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Supported agents:/);
  assert.match(help.stdout, /codex\s+supported/);
  assert.match(help.stdout, /copilot-cli\s+supported/);
  assert.match(help.stdout, /cursor\s+experimental/);

  const agents = spawnSync(process.execPath, [bin, 'agents', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(agents.status, 0, agents.stderr);
  const payload = JSON.parse(agents.stdout);
  assert.ok(payload.some((agent) => agent.id === 'codex' && agent.status === 'supported'));
  assert.ok(payload.some((agent) => agent.id === 'cursor' && agent.status === 'experimental'));
});

test('mcp command prints separate package installation guidance', async () => {
  const result = spawnSync(process.execPath, [bin, 'mcp'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm install -g @oh-my-trace\/mcp/);
  assert.match(result.stdout, /"command": "oh-my-trace-mcp"/);
});

test('query supports desc default, asc order, and timestamp range filters', async () => {
  const home = await initFixtureHome();
  const ingest = spawnSync(process.execPath, [bin, 'ingest', '--home', home, '--source', 'codex', '--since', '2026-04-26'], { encoding: 'utf8' });
  assert.equal(ingest.status, 0, ingest.stderr);

  const defaultOrder = spawnSync(process.execPath, [bin, 'query', '--home', home, '--source', 'codex', '--limit', '2', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(defaultOrder.status, 0, defaultOrder.stderr);
  const defaultEvents = JSON.parse(defaultOrder.stdout);
  assert.deepEqual(defaultEvents.map((event) => event.timestamp), [
    '2026-04-26T00:03:00.000Z',
    '2026-04-26T00:02:00.000Z'
  ]);

  const asc = spawnSync(process.execPath, [bin, 'query', '--home', home, '--source', 'codex', '--limit', '2', '--order', 'asc', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(asc.status, 0, asc.stderr);
  const ascEvents = JSON.parse(asc.stdout);
  assert.deepEqual(ascEvents.map((event) => event.timestamp), [
    '2026-04-26T00:01:00.000Z',
    '2026-04-26T00:02:00.000Z'
  ]);

  const range = spawnSync(process.execPath, [
    bin,
    'query',
    '--home',
    home,
    '--source',
    'codex',
    '--since',
    '2026-04-26T00:02:00.000Z',
    '--until',
    '2026-04-26T00:03:00.000Z',
    '--order',
    'desc',
    '--limit',
    '10',
    '--format',
    'json'
  ], { encoding: 'utf8' });
  assert.equal(range.status, 0, range.stderr);
  const rangeEvents = JSON.parse(range.stdout);
  assert.deepEqual(rangeEvents.map((event) => event.timestamp), [
    '2026-04-26T00:03:00.000Z',
    '2026-04-26T00:02:00.000Z'
  ]);
});

test('status exposes per-agent source collection counts', async () => {
  const home = await initFixtureHome();
  const ingest = spawnSync(process.execPath, [bin, 'ingest', '--home', home, '--since', '2026-04-26'], { encoding: 'utf8' });
  assert.equal(ingest.status, 0, ingest.stderr);

  const status = spawnSync(process.execPath, [bin, 'status', '--home', home], { encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr);
  const payload = JSON.parse(status.stdout);
  const bySource = Object.fromEntries(payload.bySource.map((source) => [source.source, source]));
  assert.ok(bySource.codex.eventCount > 0);
  assert.ok(bySource.claude.eventCount > 0);
  assert.ok(bySource.gemini.eventCount > 0);
  assert.ok(bySource['copilot-cli'].eventCount > 0);
  assert.equal(payload.recentIngestRuns[0].eventsInserted, payload.eventCount);
});

test('re-ingesting the same source is idempotent', async () => {
  const home = await initFixtureHome();
  const first = spawnSync(process.execPath, [bin, 'ingest', '--home', home, '--source', 'codex', '--since', '2026-04-26'], { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  const firstPayload = JSON.parse(first.stdout);
  assert.ok(firstPayload.eventsInserted > 0);

  const firstStatus = spawnSync(process.execPath, [bin, 'status', '--home', home], { encoding: 'utf8' });
  const firstEventCount = JSON.parse(firstStatus.stdout).eventCount;

  const second = spawnSync(process.execPath, [bin, 'ingest', '--home', home, '--source', 'codex', '--since', '2026-04-26'], { encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr);
  const secondPayload = JSON.parse(second.stdout);
  assert.equal(secondPayload.eventsSeen, firstPayload.eventsSeen);
  assert.equal(secondPayload.eventsInserted, 0);

  const secondStatus = spawnSync(process.execPath, [bin, 'status', '--home', home], { encoding: 'utf8' });
  const secondEventCount = JSON.parse(secondStatus.stdout).eventCount;
  assert.equal(secondEventCount, firstEventCount);
});

test('doctor reports sqlite and source roots', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omt-home-'));
  spawnSync(process.execPath, [bin, 'init', '--home', home], { encoding: 'utf8' });
  const doctor = spawnSync(process.execPath, [bin, 'doctor', '--home', home], { encoding: 'utf8' });
  assert.equal(doctor.status, 0, doctor.stderr);
  const payload = JSON.parse(doctor.stdout);
  assert.equal(payload.home, home);
  assert.ok(payload.sqlite.includes('.'));
  assert.ok(payload.sources.some((source) => source.id === 'codex'));
});

test('mcp package bin lists tools over stdio json-rpc', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omt-home-'));
  spawnSync(process.execPath, [bin, 'init', '--home', home], { encoding: 'utf8' });
  const child = spawnSync(process.execPath, [mcpBin], {
    input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`,
    encoding: 'utf8',
    env: { ...process.env, OMT_HOME: home }
  });
  assert.equal(child.status, 0, child.stderr);
  const lines = child.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(lines[0].result.serverInfo.name, 'oh-my-trace');
  const searchEvents = lines[1].result.tools.find((tool) => tool.name === 'search_events');
  assert.ok(searchEvents);
  assert.ok(searchEvents.inputSchema.properties.since);
  assert.ok(searchEvents.inputSchema.properties.order);
  const toolNames = new Set(lines[1].result.tools.map((tool) => tool.name));
  for (const name of ['initialize_store', 'doctor', 'list_agents', 'collect_history', 'list_sessions']) {
    assert.ok(toolNames.has(name), `${name} should be listed`);
  }
});

test('mcp package can collect history and expose diagnostics over stdio json-rpc', async () => {
  const home = await initFixtureHome();
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'collect_history', arguments: { source: 'codex', since: '2026-04-26' } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'collect_history', arguments: { source: 'codex', since: '2026-04-26' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'doctor', arguments: {} } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_agents', arguments: {} } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_sessions', arguments: { source: 'codex' } } }
  ].map((request) => JSON.stringify(request)).join('\n');

  const child = spawnSync(process.execPath, [mcpBin], {
    input: `${input}\n`,
    encoding: 'utf8',
    env: { ...process.env, OMT_HOME: home }
  });
  assert.equal(child.status, 0, child.stderr);
  const lines = child.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));

  const firstCollect = JSON.parse(lines[1].result.content[0].text);
  assert.equal(firstCollect.adapters[0], 'codex');
  assert.ok(firstCollect.eventsSeen > 0);
  assert.ok(firstCollect.eventsInserted > 0);

  const secondCollect = JSON.parse(lines[2].result.content[0].text);
  assert.equal(secondCollect.eventsSeen, firstCollect.eventsSeen);
  assert.equal(secondCollect.eventsInserted, 0);

  const doctor = JSON.parse(lines[3].result.content[0].text);
  assert.equal(doctor.home, home);
  assert.ok(doctor.sources.some((source) => source.id === 'codex' && source.roots.some((root) => root.exists)));

  const agents = JSON.parse(lines[4].result.content[0].text);
  assert.ok(agents.some((agent) => agent.id === 'codex' && agent.status === 'supported'));

  const sessions = JSON.parse(lines[5].result.content[0].text);
  assert.ok(sessions.some((session) => session.source === 'codex'));
});

test('mcp package bin still starts when existing db is readonly', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omt-home-'));
  spawnSync(process.execPath, [bin, 'init', '--home', home], { encoding: 'utf8' });
  await fs.chmod(path.join(home, 'storage.sqlite'), 0o444);
  const child = spawnSync(process.execPath, [mcpBin], {
    input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`,
    encoding: 'utf8',
    env: { ...process.env, OMT_HOME: home }
  });
  await fs.chmod(path.join(home, 'storage.sqlite'), 0o644);
  assert.equal(child.status, 0, child.stderr);
  const lines = child.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(lines[0].result.serverInfo.name, 'oh-my-trace');
  assert.ok(lines[0].result.startupWarnings.some((warning) => warning.includes('readonly database')));
  assert.ok(lines[1].result.tools.some((tool) => tool.name === 'search_events'));
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
