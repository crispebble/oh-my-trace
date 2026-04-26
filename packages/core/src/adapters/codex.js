import path from 'node:path';
import { walkFiles, readJsonLines } from '../core/file-walk.js';
import { inRange, toIso } from '../core/time.js';
import { addEvent, addSession, createAccumulator, stableId, textFromUnknown } from './common.js';

export const codexAdapter = {
  id: 'codex',
  async ingest(config, options) {
    const acc = createAccumulator();
    const roots = config.sources.codex?.roots || ['~/.codex/sessions'];
    for (const root of roots) {
      const files = await walkFiles(root, (file) => file.endsWith('.jsonl'));
      for (const file of files) {
        acc.filesSeen += 1;
        const rows = await readJsonLines(file);
        let sourceSessionId = path.basename(file, '.jsonl');
        let sessionId = null;
        for (const row of rows) {
          if (row.error) {
            acc.errors += 1;
            continue;
          }
          const rec = row.value;
          const timestamp = toIso(rec.timestamp);
          if (!inRange(timestamp, options)) continue;
          const payload = rec.payload || {};
          if (rec.type === 'session_meta') {
            sourceSessionId = payload.id || payload.session_id || sourceSessionId;
          }
          sessionId = addSession(acc, {
            source: 'codex',
            sourceSessionId,
            cwd: payload.cwd || payload.current_dir || null,
            startedAt: timestamp,
            endedAt: timestamp,
            rawRef: file
          });
          const event = codexEvent(rec, payload, row.index);
          if (!event) continue;
          addEvent(acc, {
            ...event,
            source: 'codex',
            sessionId,
            timestamp,
            rawRef: `${file}:${row.index + 1}`
          });
        }
      }
    }
    return acc;
  }
};

function codexEvent(rec, payload, index) {
  if (rec.type === 'event_msg') {
    return {
      sourceEventId: stableId('codex', String(index), rec.timestamp, rec.type),
      eventType: 'status',
      role: 'system',
      content: textFromUnknown(payload.message || payload)
    };
  }
  if (rec.type !== 'response_item') return null;
  const item = payload.item || payload;
  const type = item.type || payload.type;
  if (type === 'message') {
    return {
      sourceEventId: item.id || stableId('codex-message', String(index), rec.timestamp),
      eventType: 'message',
      role: item.role || payload.role || null,
      content: textFromUnknown(item.content || payload.content)
    };
  }
  if (type === 'function_call' || type === 'tool_call') {
    return {
      sourceEventId: item.id || item.call_id || stableId('codex-tool', String(index), rec.timestamp),
      eventType: 'tool_call',
      role: 'tool',
      toolName: item.name || payload.name || null,
      content: item.name || payload.name || type
    };
  }
  if (type === 'function_call_output' || type === 'tool_result') {
    return {
      sourceEventId: item.id || item.call_id || stableId('codex-tool-result', String(index), rec.timestamp),
      eventType: 'tool_result',
      role: 'tool',
      toolName: item.name || payload.name || null,
      content: item.name || payload.name || type
    };
  }
  return {
    sourceEventId: item.id || stableId('codex-response', String(index), rec.timestamp),
    eventType: type || 'response_item',
    role: item.role || null,
    content: textFromUnknown(item.summary || item.content || type)
  };
}
