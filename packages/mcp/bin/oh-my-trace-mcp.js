#!/usr/bin/env node
import { resolveHome } from '@oh-my-trace/core/core/paths.js';
import { initializeStore } from '@oh-my-trace/core/operations.js';
import { runMcpServer } from '../src/server.js';

const homeDir = resolveHome(process.env.OMT_HOME);
const startupWarnings = [];

try {
  const { warnings } = await initializeStore(homeDir, { continueOnStorageError: true });
  startupWarnings.push(...warnings);
  await runMcpServer({ homeDir, startupWarnings });
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
