#!/usr/bin/env node
import { ensureHome, loadConfig } from '@oh-my-trace/core/core/config.js';
import { resolveHome } from '@oh-my-trace/core/core/paths.js';
import { initDb, upsertSources } from '@oh-my-trace/core/core/storage.js';
import { runMcpServer } from '../src/server.js';

const homeDir = resolveHome(process.env.OMT_HOME);

try {
  await ensureHome(homeDir);
  const config = await loadConfig(homeDir);
  await initDb(homeDir);
  await upsertSources(homeDir, config);
  await runMcpServer({ homeDir, config });
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
