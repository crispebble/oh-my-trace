import os from 'node:os';
import path from 'node:path';

export const PACKAGE_NAME = 'oh-my-trace';
export const COMMAND_NAME = 'omt';
export const HOME_DIR_NAME = 'omt';
export const LEGACY_HOME_DIR_NAME = 'oh-my-trace';

export function expandHome(input) {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function defaultHomeDir() {
  return path.join(os.homedir(), `.${HOME_DIR_NAME}`);
}

export function legacyHomeDir() {
  return path.join(os.homedir(), `.${LEGACY_HOME_DIR_NAME}`);
}

export function resolveHome(cliHome) {
  return path.resolve(expandHome(cliHome || process.env.OMT_HOME || defaultHomeDir()));
}

export function homePaths(homeDir) {
  return {
    homeDir,
    configPath: path.join(homeDir, 'config.json'),
    dbPath: path.join(homeDir, 'storage.sqlite'),
    exportsDir: path.join(homeDir, 'exports'),
    logsDir: path.join(homeDir, 'logs'),
    tmpDir: path.join(homeDir, 'tmp')
  };
}
