#!/usr/bin/env node
import { resolveHome } from '@oh-my-trace/core/core/paths.js';
import { runMcpServer } from '../src/server.js';

const homeDir = resolveHome(process.env.OMT_HOME);

try {
  await runMcpServer({ homeDir });
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
