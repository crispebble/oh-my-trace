import { spawn } from 'node:child_process';

export function sqlQuote(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function runSqlite(dbPath, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('sqlite3', [dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `sqlite3 exited with code ${code}`));
      }
    });
    child.stdin.end(sql);
  });
}

export async function queryJson(dbPath, sql) {
  const output = await runSqlite(dbPath, `.mode json\n${sql}\n`);
  const trimmed = output.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}
