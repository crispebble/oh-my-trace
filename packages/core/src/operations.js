import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { ensureHome, loadConfig } from './core/config.js';
import { homePaths, legacyHomeDir, expandHome } from './core/paths.js';
import {
  finishIngestRun,
  initDb,
  persistNormalized,
  startIngestRun,
  upsertSources
} from './core/storage.js';
import { selectedAdapters } from './adapters/index.js';
import { SUPPORTED_AGENTS } from './agents.js';

export async function initializeStore(homeDir, options = {}) {
  const paths = await ensureHome(homeDir);
  const config = await loadConfig(homeDir);
  const warnings = [];
  try {
    await initDb(homeDir);
    await upsertSources(homeDir, config);
  } catch (error) {
    if (!options.continueOnStorageError) throw error;
    warnings.push(error?.message || String(error));
  }
  return { paths, config, warnings };
}

export async function doctorReport(homeDir) {
  const { config } = await initializeStore(homeDir);
  const paths = homePaths(homeDir);
  const sqlite = spawnSync('sqlite3', ['--version'], { encoding: 'utf8' });
  const legacyHomePath = legacyHomeDir();
  let legacyHomeExists = false;
  try {
    await fs.access(legacyHomePath);
    legacyHomeExists = true;
  } catch {
    legacyHomeExists = false;
  }
  const sourceRows = [];
  for (const [id, source] of Object.entries(config.sources)) {
    const roots = [];
    for (const root of source.roots || []) {
      const expanded = expandHome(root);
      let exists = false;
      try {
        await fs.access(expanded);
        exists = true;
      } catch {
        exists = false;
      }
      roots.push({ root, exists });
    }
    sourceRows.push({ id, enabled: source.enabled, experimental: Boolean(source.experimental), roots });
  }
  return {
    home: paths.homeDir,
    config: paths.configPath,
    legacyHome: {
      path: legacyHomePath,
      exists: legacyHomeExists,
      note: legacyHomeExists ? 'Legacy home exists; it is not migrated or modified automatically.' : null
    },
    sqlite: sqlite.status === 0 ? sqlite.stdout.trim() : 'missing',
    supportedAgents: SUPPORTED_AGENTS,
    sources: sourceRows
  };
}

export async function collectHistory(homeDir, options = {}) {
  const { config } = await initializeStore(homeDir);
  const adapters = selectedAdapters(config, options.source);
  const runId = await startIngestRun(homeDir, options);
  const summary = { filesSeen: 0, eventsSeen: 0, eventsInserted: 0, errors: 0 };
  try {
    for (const adapter of adapters) {
      const normalized = await adapter.ingest(config, options);
      const persisted = await persistNormalized(homeDir, normalized);
      summary.filesSeen += normalized.filesSeen;
      summary.eventsSeen += normalized.eventsSeen;
      summary.eventsInserted += persisted.insertedEvents;
      summary.errors += normalized.errors;
    }
    await finishIngestRun(homeDir, runId, summary);
    return { runId, adapters: adapters.map((adapter) => adapter.id), ...summary };
  } catch (error) {
    summary.errors += 1;
    await finishIngestRun(homeDir, runId, summary);
    throw error;
  }
}
