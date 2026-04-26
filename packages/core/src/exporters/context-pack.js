import fs from 'node:fs/promises';
import path from 'node:path';
import { homePaths } from '../core/paths.js';
import { queryEvents, listSessions } from '../core/storage.js';
import { rangeLabel } from '../core/time.js';

export async function renderEvents(events, format = 'md') {
  if (format === 'json') {
    return `${JSON.stringify(events, null, 2)}\n`;
  }
  const lines = [];
  for (const event of events) {
    const marker = event.contentRedacted ? ' redacted' : '';
    const tool = event.toolName ? ` tool=${event.toolName}` : '';
    lines.push(`- ${event.timestamp || 'unknown-time'} [${event.source}/${event.role || event.eventType}${tool}${marker}]`);
    if (event.projectHint) lines.push(`  - project: ${event.projectHint}`);
    if (event.content) {
      for (const contentLine of String(event.content).split(/\r?\n/).slice(0, 20)) {
        lines.push(`  ${contentLine}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function exportContextPack(homeDir, filters, format = 'context-pack') {
  const paths = homePaths(homeDir);
  const label = rangeLabel(filters);
  const outDir = path.join(paths.exportsDir, label);
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  const events = await queryEvents(homeDir, { ...filters, limit: filters.limit || 500 });
  const sessions = await listSessions(homeDir, { limit: 500 });

  if (format === 'json' || format === 'timeline-json') {
    const filePath = path.join(outDir, 'timeline.json');
    await fs.writeFile(filePath, `${JSON.stringify({ filters, sessions, events }, null, 2)}\n`, { mode: 0o600 });
    return { filePath, eventCount: events.length, sessionCount: sessions.length };
  }

  const content = [
    '# oh-my-trace Context Pack',
    '',
    `- range: ${label}`,
    `- generated_at: ${new Date().toISOString()}`,
    `- events: ${events.length}`,
    `- sessions_indexed: ${sessions.length}`,
    '',
    '## Redaction Notes',
    '',
    '- Credential-like values are masked before export.',
    '- Auth/cookie/local-storage sources are excluded by default.',
    '- This file is evidence/context for an AI reader, not a generated retrospective.',
    '',
    '## Sessions',
    '',
    ...sessions.slice(0, 100).map((session) => `- ${session.id} [${session.source}] ${session.startedAt || 'unknown'} events=${session.eventCount} ${session.projectHint || session.cwd || ''}`),
    '',
    '## Events',
    '',
    await renderEvents(events, 'md')
  ].join('\n');
  const fileName = format === 'session-md' ? 'sessions.md' : 'context-pack.md';
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, content, { mode: 0o600 });
  return { filePath, eventCount: events.length, sessionCount: sessions.length };
}
