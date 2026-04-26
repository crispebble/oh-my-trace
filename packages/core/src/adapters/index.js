import { codexAdapter } from './codex.js';
import { claudeAdapter } from './claude.js';
import { geminiAdapter } from './gemini.js';
import { copilotCliAdapter } from './copilot-cli.js';

export const adapters = new Map([
  [codexAdapter.id, codexAdapter],
  [claudeAdapter.id, claudeAdapter],
  [geminiAdapter.id, geminiAdapter],
  [copilotCliAdapter.id, copilotCliAdapter]
]);

export function selectedAdapters(config, sourceFilter) {
  const requested = sourceFilter
    ? new Set(sourceFilter.split(',').map((item) => item.trim()).filter(Boolean))
    : null;
  const result = [];
  for (const [id, adapter] of adapters.entries()) {
    const sourceConfig = config.sources[id];
    if (!sourceConfig?.enabled) continue;
    if (requested && !requested.has(id)) continue;
    result.push(adapter);
  }
  return result;
}
