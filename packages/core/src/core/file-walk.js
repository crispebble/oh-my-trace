import fs from 'node:fs/promises';
import path from 'node:path';
import { expandHome } from './paths.js';
import { isSensitivePath } from './redaction.js';

export async function pathExists(filePath) {
  try {
    await fs.access(expandHome(filePath));
    return true;
  } catch {
    return false;
  }
}

export async function walkFiles(root, predicate) {
  const expanded = expandHome(root);
  const files = [];
  async function visit(current) {
    if (isSensitivePath(current)) return;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile() && predicate(full)) {
        files.push(full);
      }
    }
  }
  await visit(expanded);
  return files.sort();
}

export async function readJsonLines(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const rows = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push({ index, value: JSON.parse(line) });
    } catch (error) {
      rows.push({ index, error: error.message });
    }
  }
  return rows;
}
