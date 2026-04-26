import fs from 'node:fs/promises';
import path from 'node:path';
import { homePaths } from './paths.js';

export const DEFAULT_CONFIG = {
  version: 1,
  packageName: 'oh-my-trace',
  commandName: 'omt',
  redaction: {
    enabled: true
  },
  sources: {
    codex: {
      enabled: true,
      trustLevel: 'high',
      roots: ['~/.codex/sessions']
    },
    claude: {
      enabled: true,
      trustLevel: 'high',
      roots: ['~/.claude/projects', '~/.claude/transcripts']
    },
    gemini: {
      enabled: true,
      trustLevel: 'high',
      roots: ['~/.gemini/tmp']
    },
    'copilot-cli': {
      enabled: true,
      trustLevel: 'high',
      roots: ['~/.copilot/session-state']
    },
    'copilot-vscode': {
      enabled: false,
      experimental: true,
      trustLevel: 'unknown',
      roots: ['~/Library/Application Support/Code/User']
    },
    'copilot-jetbrains': {
      enabled: false,
      experimental: true,
      trustLevel: 'unknown',
      roots: ['~/.config/github-copilot']
    },
    cursor: {
      enabled: false,
      experimental: true,
      trustLevel: 'unknown',
      roots: ['~/.cursor', '~/Library/Application Support/Cursor/User']
    },
    'gemini-antigravity': {
      enabled: false,
      experimental: true,
      trustLevel: 'unknown',
      roots: ['~/.gemini/antigravity']
    }
  }
};

export async function ensureHome(homeDir) {
  const paths = homePaths(homeDir);
  await fs.mkdir(paths.homeDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.exportsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.logsDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(paths.tmpDir, { recursive: true, mode: 0o700 });
  try {
    await fs.access(paths.configPath);
  } catch {
    await fs.writeFile(paths.configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { mode: 0o600 });
  }
  return paths;
}

export async function loadConfig(homeDir) {
  const paths = await ensureHome(homeDir);
  const raw = await fs.readFile(paths.configPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    ...DEFAULT_CONFIG,
    ...parsed,
    sources: {
      ...DEFAULT_CONFIG.sources,
      ...(parsed.sources || {})
    }
  };
}

export async function writeConfig(homeDir, config) {
  const paths = homePaths(homeDir);
  await fs.mkdir(path.dirname(paths.configPath), { recursive: true });
  await fs.writeFile(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
