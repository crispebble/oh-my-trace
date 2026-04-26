import fs from 'node:fs/promises';
import path from 'node:path';
import { walkFiles } from '../core/file-walk.js';
import { inRange, toIso } from '../core/time.js';
import { addEvent, addSession, createAccumulator, stableId, textFromUnknown } from './common.js';

export const geminiAdapter = {
  id: 'gemini',
  async ingest(config, options) {
    const acc = createAccumulator();
    const roots = config.sources.gemini?.roots || ['~/.gemini/tmp'];
    for (const root of roots) {
      const files = await walkFiles(root, (file) => file.endsWith('.json') && (file.includes(`${path.sep}chats${path.sep}`) || path.basename(file) === 'logs.json'));
      for (const file of files) {
        acc.filesSeen += 1;
        try {
          const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
          if (Array.isArray(parsed)) {
            ingestLogs(acc, file, parsed, options);
          } else if (Array.isArray(parsed.messages)) {
            ingestChat(acc, file, parsed, options);
          }
        } catch {
          acc.errors += 1;
        }
      }
    }
    return acc;
  }
};

function ingestChat(acc, file, chat, options) {
  const sourceSessionId = chat.sessionId || path.basename(file, '.json');
  const sessionId = addSession(acc, {
    source: 'gemini',
    sourceSessionId,
    projectHint: chat.projectHash || null,
    startedAt: toIso(chat.startTime),
    endedAt: toIso(chat.lastUpdated),
    rawRef: file
  });
  for (const [index, message] of chat.messages.entries()) {
    const timestamp = toIso(message.timestamp || chat.startTime);
    if (!inRange(timestamp, options)) continue;
    addEvent(acc, {
      source: 'gemini',
      sessionId,
      sourceEventId: message.id || stableId('gemini', file, String(index), timestamp),
      timestamp,
      role: message.type === 'gemini' ? 'assistant' : message.type || null,
      eventType: 'message',
      content: textFromUnknown(message.content),
      rawRef: `${file}:messages[${index}]`
    });
  }
}

function ingestLogs(acc, file, logs, options) {
  for (const [index, entry] of logs.entries()) {
    const timestamp = toIso(entry.timestamp);
    if (!inRange(timestamp, options)) continue;
    const sourceSessionId = entry.sessionId || path.basename(path.dirname(file));
    const sessionId = addSession(acc, {
      source: 'gemini',
      sourceSessionId,
      startedAt: timestamp,
      endedAt: timestamp,
      rawRef: file
    });
    addEvent(acc, {
      source: 'gemini',
      sessionId,
      sourceEventId: entry.messageId || stableId('gemini-log', file, String(index), timestamp),
      timestamp,
      role: entry.type || null,
      eventType: 'log',
      content: textFromUnknown(entry.message || entry),
      rawRef: `${file}:${index + 1}`
    });
  }
}
