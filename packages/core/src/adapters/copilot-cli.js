import path from 'node:path';
import { readJsonLines, walkFiles } from '../core/file-walk.js';
import { inRange, toIso } from '../core/time.js';
import { addEvent, addSession, createAccumulator, stableId, textFromUnknown } from './common.js';

export const copilotCliAdapter = {
  id: 'copilot-cli',
  async ingest(config, options) {
    const acc = createAccumulator();
    const roots = config.sources['copilot-cli']?.roots || ['~/.copilot/session-state'];
    for (const root of roots) {
      const files = await walkFiles(root, (file) => path.basename(file) === 'events.jsonl');
      for (const file of files) {
        acc.filesSeen += 1;
        const rows = await readJsonLines(file);
        const sourceSessionId = path.basename(path.dirname(file));
        let sessionId = null;
        for (const row of rows) {
          if (row.error) {
            acc.errors += 1;
            continue;
          }
          const rec = row.value;
          const timestamp = toIso(rec.timestamp);
          if (!inRange(timestamp, options)) continue;
          sessionId = addSession(acc, {
            source: 'copilot-cli',
            sourceSessionId,
            cwd: rec.data?.cwd || null,
            startedAt: timestamp,
            endedAt: timestamp,
            rawRef: file
          });
          const mapped = mapCopilotEvent(rec, file, row.index);
          if (!mapped) continue;
          addEvent(acc, {
            ...mapped,
            source: 'copilot-cli',
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

function mapCopilotEvent(rec, file, index) {
  const data = rec.data || {};
  if (rec.type === 'user.message') {
    return {
      sourceEventId: rec.id || stableId('copilot-user', file, String(index)),
      role: 'user',
      eventType: 'message',
      content: textFromUnknown(data.message || data.content || data.prompt || data)
    };
  }
  if (rec.type === 'assistant.message') {
    return {
      sourceEventId: rec.id || stableId('copilot-assistant', file, String(index)),
      role: 'assistant',
      eventType: 'message',
      content: textFromUnknown(data.message || data.content || data.response || data)
    };
  }
  if (String(rec.type || '').startsWith('tool.')) {
    return {
      sourceEventId: rec.id || stableId('copilot-tool', file, String(index)),
      role: 'tool',
      eventType: rec.type,
      toolName: data.toolName || data.tool_name || data.name || null,
      content: data.toolName || data.tool_name || data.name || rec.type
    };
  }
  return {
    sourceEventId: rec.id || stableId('copilot-event', file, String(index)),
    role: null,
    eventType: rec.type || 'event',
    content: textFromUnknown(data.message || data)
  };
}
