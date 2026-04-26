import crypto from 'node:crypto';
import path from 'node:path';
import { redactText } from '../core/redaction.js';
import { toIso } from '../core/time.js';

export function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.filter(Boolean).join('\u001f')).digest('hex').slice(0, 32);
}

export function createAccumulator() {
  return {
    sessions: new Map(),
    events: [],
    filesSeen: 0,
    eventsSeen: 0,
    errors: 0
  };
}

export function addSession(acc, session) {
  const id = session.id || stableId(session.source, session.sourceSessionId, session.rawRef);
  const existing = acc.sessions.get(id);
  acc.sessions.set(id, {
    id,
    source: session.source,
    sourceSessionId: session.sourceSessionId || id,
    projectHint: session.projectHint || existing?.projectHint || null,
    cwd: session.cwd || existing?.cwd || null,
    startedAt: earliest(existing?.startedAt, session.startedAt),
    endedAt: latest(existing?.endedAt, session.endedAt),
    rawRef: session.rawRef || existing?.rawRef || null
  });
  return id;
}

export function addEvent(acc, event) {
  const { text, redacted } = redactText(event.content);
  acc.eventsSeen += 1;
  acc.events.push({
    source: event.source,
    sessionId: event.sessionId,
    sourceEventId: event.sourceEventId || null,
    timestamp: toIso(event.timestamp),
    role: event.role || null,
    eventType: event.eventType || 'message',
    content: text,
    contentRedacted: redacted || Boolean(event.contentRedacted),
    toolName: event.toolName || null,
    cwd: event.cwd || null,
    rawRef: event.rawRef || null,
    confidence: event.confidence || 'high'
  });
}

export function basenameProjectHint(filePath) {
  const parent = path.basename(path.dirname(filePath));
  return parent && parent !== '.' ? parent : null;
}

function earliest(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function latest(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export function textFromUnknown(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.content)) return textFromUnknown(value.content);
    if (typeof value.message === 'string') return value.message;
    return JSON.stringify(value);
  }
  return String(value);
}
