import crypto from 'node:crypto';
import { homePaths } from './paths.js';
import { queryJson, runSqlite, sqlQuote } from './sqlite.js';
import { rangeBoundToIso } from './time.js';

export function eventId(event) {
  return crypto
    .createHash('sha256')
    .update([
      event.source,
      event.sessionId,
      event.timestamp || '',
      event.eventType || '',
      event.role || '',
      event.sourceEventId || '',
      event.content || '',
      event.toolName || ''
    ].join('\u001f'))
    .digest('hex');
}

export async function initDb(homeDir) {
  const { dbPath } = homePaths(homeDir);
  await runSqlite(dbPath, `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', '1');
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  trust_level TEXT NOT NULL,
  experimental INTEGER NOT NULL DEFAULT 0,
  roots_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_session_id TEXT,
  project_hint TEXT,
  cwd TEXT,
  started_at TEXT,
  ended_at TEXT,
  raw_ref TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(source, source_session_id, raw_ref)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_event_id TEXT,
  timestamp TEXT,
  role TEXT,
  event_type TEXT NOT NULL,
  content TEXT,
  content_redacted INTEGER NOT NULL DEFAULT 0,
  tool_name TEXT,
  cwd TEXT,
  raw_ref TEXT,
  confidence TEXT NOT NULL DEFAULT 'high',
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title TEXT,
  raw_ref TEXT,
  content TEXT,
  content_redacted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
CREATE TABLE IF NOT EXISTS ingest_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  source_filter TEXT,
  since TEXT,
  until TEXT,
  files_seen INTEGER NOT NULL DEFAULT 0,
  events_seen INTEGER NOT NULL DEFAULT 0,
  events_inserted INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL
);
`);
  return dbPath;
}

export async function upsertSources(homeDir, config) {
  const { dbPath } = homePaths(homeDir);
  const statements = Object.entries(config.sources || {}).map(([id, source]) => {
    return `INSERT OR REPLACE INTO sources(id, kind, enabled, trust_level, experimental, roots_json)
VALUES (${sqlQuote(id)}, ${sqlQuote(id)}, ${sqlQuote(Boolean(source.enabled))}, ${sqlQuote(source.trustLevel || 'unknown')}, ${sqlQuote(Boolean(source.experimental))}, ${sqlQuote(JSON.stringify(source.roots || []))});`;
  });
  await runSqlite(dbPath, `BEGIN;\n${statements.join('\n')}\nCOMMIT;\n`);
}

export async function startIngestRun(homeDir, options) {
  const { dbPath } = homePaths(homeDir);
  const id = crypto.randomUUID();
  await runSqlite(dbPath, `INSERT INTO ingest_runs(id, started_at, source_filter, since, until, status)
VALUES (${sqlQuote(id)}, ${sqlQuote(new Date().toISOString())}, ${sqlQuote(options.source || null)}, ${sqlQuote(options.since || null)}, ${sqlQuote(options.until || null)}, 'running');`);
  return id;
}

export async function finishIngestRun(homeDir, runId, summary) {
  const { dbPath } = homePaths(homeDir);
  await runSqlite(dbPath, `UPDATE ingest_runs SET
ended_at=${sqlQuote(new Date().toISOString())},
files_seen=${sqlQuote(summary.filesSeen || 0)},
events_seen=${sqlQuote(summary.eventsSeen || 0)},
events_inserted=${sqlQuote(summary.eventsInserted || 0)},
errors=${sqlQuote(summary.errors || 0)},
status=${sqlQuote(summary.errors ? 'completed_with_errors' : 'completed')}
WHERE id=${sqlQuote(runId)};`);
}

export async function persistNormalized(homeDir, normalized) {
  const { dbPath } = homePaths(homeDir);
  const now = new Date().toISOString();
  const statements = [];
  let attemptedEvents = 0;
  for (const session of normalized.sessions.values()) {
    statements.push(`INSERT INTO sessions(id, source, source_session_id, project_hint, cwd, started_at, ended_at, raw_ref, updated_at)
VALUES (${sqlQuote(session.id)}, ${sqlQuote(session.source)}, ${sqlQuote(session.sourceSessionId)}, ${sqlQuote(session.projectHint)}, ${sqlQuote(session.cwd)}, ${sqlQuote(session.startedAt)}, ${sqlQuote(session.endedAt)}, ${sqlQuote(session.rawRef)}, ${sqlQuote(now)})
ON CONFLICT(id) DO UPDATE SET
started_at=COALESCE(excluded.started_at, sessions.started_at),
ended_at=COALESCE(excluded.ended_at, sessions.ended_at),
project_hint=COALESCE(excluded.project_hint, sessions.project_hint),
cwd=COALESCE(excluded.cwd, sessions.cwd),
updated_at=excluded.updated_at;`);
  }
  for (const event of normalized.events) {
    const id = event.id || eventId(event);
    statements.push(`INSERT OR IGNORE INTO events(id, session_id, source, source_event_id, timestamp, role, event_type, content, content_redacted, tool_name, cwd, raw_ref, confidence, created_at)
VALUES (${sqlQuote(id)}, ${sqlQuote(event.sessionId)}, ${sqlQuote(event.source)}, ${sqlQuote(event.sourceEventId)}, ${sqlQuote(event.timestamp)}, ${sqlQuote(event.role)}, ${sqlQuote(event.eventType)}, ${sqlQuote(event.content)}, ${sqlQuote(Boolean(event.contentRedacted))}, ${sqlQuote(event.toolName)}, ${sqlQuote(event.cwd)}, ${sqlQuote(event.rawRef)}, ${sqlQuote(event.confidence || 'high')}, ${sqlQuote(now)});`);
    attemptedEvents += 1;
  }
  if (statements.length === 0) return { attemptedEvents: 0, insertedEvents: 0 };
  const before = await countEvents(homeDir);
  await runSqlite(dbPath, `BEGIN;\n${statements.join('\n')}\nCOMMIT;\n`);
  const after = await countEvents(homeDir);
  return { attemptedEvents, insertedEvents: Math.max(0, after - before) };
}

export async function countEvents(homeDir) {
  const { dbPath } = homePaths(homeDir);
  const rows = await queryJson(dbPath, 'SELECT count(*) AS count FROM events;');
  return Number(rows[0]?.count || 0);
}

export async function queryEvents(homeDir, filters) {
  const { dbPath } = homePaths(homeDir);
  const where = [];
  if (filters.source) {
    const sources = filters.source.split(',').map((s) => sqlQuote(s.trim())).join(',');
    where.push(`e.source IN (${sources})`);
  }
  if (filters.since) where.push(`e.timestamp >= ${sqlQuote(rangeBoundToIso(filters.since, 'start'))}`);
  if (filters.until) where.push(`e.timestamp <= ${sqlQuote(rangeBoundToIso(filters.until, 'end'))}`);
  if (filters.project) where.push(`(s.project_hint LIKE ${sqlQuote(`%${filters.project}%`)} OR s.cwd LIKE ${sqlQuote(`%${filters.project}%`)})`);
  if (filters.sessionId) where.push(`e.session_id = ${sqlQuote(filters.sessionId)}`);
  if (filters.text) where.push(`e.content LIKE ${sqlQuote(`%${filters.text}%`)}`);
  const limit = Math.min(Number(filters.limit || 100), 1000);
  const order = String(filters.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sql = `
SELECT e.id, e.session_id AS sessionId, e.source, e.timestamp, e.role, e.event_type AS eventType,
       e.content, e.content_redacted AS contentRedacted, e.tool_name AS toolName,
       e.cwd, e.raw_ref AS rawRef, e.confidence, s.project_hint AS projectHint
FROM events e
LEFT JOIN sessions s ON s.id = e.session_id
${where.length ? `WHERE ${where.join(' AND ')}` : ''}
ORDER BY COALESCE(e.timestamp, e.created_at) ${order}
LIMIT ${limit};`;
  return queryJson(dbPath, sql);
}

export async function listSessions(homeDir, filters = {}) {
  const { dbPath } = homePaths(homeDir);
  const where = [];
  if (filters.sessionId) where.push(`s.id = ${sqlQuote(filters.sessionId)}`);
  if (filters.source) where.push(`s.source = ${sqlQuote(filters.source)}`);
  const sql = `
SELECT s.id, s.source, s.source_session_id AS sourceSessionId, s.project_hint AS projectHint,
       s.cwd, s.started_at AS startedAt, s.ended_at AS endedAt, s.raw_ref AS rawRef,
       count(e.id) AS eventCount
FROM sessions s
LEFT JOIN events e ON e.session_id = s.id
${where.length ? `WHERE ${where.join(' AND ')}` : ''}
GROUP BY s.id
ORDER BY COALESCE(s.started_at, s.updated_at) DESC
LIMIT ${Math.min(Number(filters.limit || 100), 1000)};`;
  return queryJson(dbPath, sql);
}

export async function status(homeDir) {
  const { dbPath } = homePaths(homeDir);
  const rows = await queryJson(dbPath, `
SELECT
  (SELECT count(*) FROM sources) AS sourceCount,
  (SELECT count(*) FROM sessions) AS sessionCount,
  (SELECT count(*) FROM events) AS eventCount,
  (SELECT count(*) FROM ingest_runs) AS ingestRunCount,
  (SELECT status FROM ingest_runs ORDER BY started_at DESC LIMIT 1) AS lastStatus,
  (SELECT ended_at FROM ingest_runs ORDER BY started_at DESC LIMIT 1) AS lastEndedAt;
`);
  const bySource = await queryJson(dbPath, `
SELECT src.id AS source,
       src.enabled AS enabled,
       src.experimental AS experimental,
       src.trust_level AS trustLevel,
       count(DISTINCT s.id) AS sessionCount,
       count(e.id) AS eventCount,
       min(e.timestamp) AS firstEventAt,
       max(e.timestamp) AS lastEventAt
FROM sources src
LEFT JOIN sessions s ON s.source = src.id
LEFT JOIN events e ON e.session_id = s.id
GROUP BY src.id
ORDER BY src.id;`);
  const recentIngestRuns = await queryJson(dbPath, `
SELECT id, started_at AS startedAt, ended_at AS endedAt, source_filter AS sourceFilter,
       since, until, files_seen AS filesSeen, events_seen AS eventsSeen,
       events_inserted AS eventsInserted, errors, status
FROM ingest_runs
ORDER BY started_at DESC
LIMIT 10;`);
  return {
    ...(rows[0] || {}),
    bySource,
    recentIngestRuns
  };
}
