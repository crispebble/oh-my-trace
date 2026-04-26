import path from 'node:path';
import { readJsonLines, walkFiles } from '../core/file-walk.js';
import { inRange, toIso } from '../core/time.js';
import { addEvent, addSession, basenameProjectHint, createAccumulator, stableId, textFromUnknown } from './common.js';

export const claudeAdapter = {
  id: 'claude',
  async ingest(config, options) {
    const acc = createAccumulator();
    const roots = config.sources.claude?.roots || ['~/.claude/projects', '~/.claude/transcripts'];
    for (const root of roots) {
      const files = await walkFiles(root, (file) => file.endsWith('.jsonl'));
      for (const file of files) {
        acc.filesSeen += 1;
        const rows = await readJsonLines(file);
        const sourceSessionId = path.basename(file, '.jsonl');
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
            source: 'claude',
            sourceSessionId: rec.sessionId || rec.session_id || sourceSessionId,
            projectHint: basenameProjectHint(file),
            startedAt: timestamp,
            endedAt: timestamp,
            rawRef: file
          });
          addEvent(acc, {
            source: 'claude',
            sessionId,
            sourceEventId: stableId('claude', file, String(row.index), rec.timestamp, rec.type),
            timestamp,
            role: rec.type === 'assistant' || rec.type === 'user' ? rec.type : null,
            eventType: rec.operation || rec.type || 'message',
            content: textFromUnknown(rec.content || rec.message || rec),
            rawRef: `${file}:${row.index + 1}`
          });
        }
      }
    }
    return acc;
  }
};
