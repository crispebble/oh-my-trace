export const SUPPORTED_AGENTS = [
  {
    id: 'codex',
    label: 'Codex',
    status: 'supported',
    defaultEnabled: true,
    source: '~/.codex/sessions'
  },
  {
    id: 'claude',
    label: 'Claude Code',
    status: 'supported',
    defaultEnabled: true,
    source: '~/.claude/projects, ~/.claude/transcripts'
  },
  {
    id: 'gemini',
    label: 'Gemini JSON',
    status: 'supported',
    defaultEnabled: true,
    source: '~/.gemini/tmp'
  },
  {
    id: 'copilot-cli',
    label: 'GitHub Copilot CLI',
    status: 'supported',
    defaultEnabled: true,
    source: '~/.copilot/session-state'
  },
  {
    id: 'copilot-vscode',
    label: 'GitHub Copilot VS Code',
    status: 'experimental',
    defaultEnabled: false,
    source: '~/Library/Application Support/Code/User'
  },
  {
    id: 'copilot-jetbrains',
    label: 'GitHub Copilot JetBrains',
    status: 'experimental',
    defaultEnabled: false,
    source: '~/.config/github-copilot'
  },
  {
    id: 'cursor',
    label: 'Cursor',
    status: 'experimental',
    defaultEnabled: false,
    source: '~/.cursor, ~/Library/Application Support/Cursor/User'
  },
  {
    id: 'gemini-antigravity',
    label: 'Gemini Antigravity',
    status: 'experimental',
    defaultEnabled: false,
    source: '~/.gemini/antigravity'
  }
];

export function supportedAgentIds() {
  return SUPPORTED_AGENTS.filter((agent) => agent.status === 'supported').map((agent) => agent.id);
}

export function formatAgentsText() {
  const rows = SUPPORTED_AGENTS.map((agent) => {
    const enabled = agent.defaultEnabled ? 'default' : 'disabled';
    return `  - ${agent.id.padEnd(18)} ${agent.status.padEnd(12)} ${enabled.padEnd(8)} ${agent.label}`;
  });
  return `Supported agents:\n${rows.join('\n')}`;
}
