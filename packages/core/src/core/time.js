export function toIso(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function inRange(iso, { since, until }) {
  if (!iso) return true;
  const time = new Date(iso).getTime();
  if (since && time < new Date(since).getTime()) return false;
  if (until && time > new Date(until).getTime()) return false;
  return true;
}

export function rangeLabel({ since, until }) {
  const start = since ? since.slice(0, 10) : 'beginning';
  const end = until ? until.slice(0, 10) : 'now';
  return `${start}_to_${end}`;
}
