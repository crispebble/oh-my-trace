const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{20,}/g, 'sk-[REDACTED]'],
  [/ghp_[A-Za-z0-9_]{20,}/g, 'ghp_[REDACTED]'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_[REDACTED]'],
  [/(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|secret|password)(["'\s:=]+)([^"'\s,}]+)/gi, '$1$2[REDACTED]'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [REDACTED]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]']
];

const SENSITIVE_PATH_PARTS = [
  '/cookies',
  '/local storage',
  '/sharedstorage',
  'oauth_creds.json',
  'google_accounts.json',
  'cursorauth/accesstoken',
  'cursorauth/refreshtoken'
];

export function isSensitivePath(filePath) {
  const normalized = String(filePath || '').toLowerCase();
  return SENSITIVE_PATH_PARTS.some((part) => normalized.includes(part));
}

export function redactText(value) {
  if (value == null) {
    return { text: '', redacted: false };
  }
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  let redacted = false;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    const next = text.replace(pattern, replacement);
    if (next !== text) redacted = true;
    text = next;
  }
  return { text, redacted };
}
