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

export function rangeBoundToIso(value, bound = 'start') {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = bound === 'end'
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return toIso(value);
}

export function inRange(iso, { since, until }) {
  if (!iso) return true;
  const time = new Date(iso).getTime();
  const sinceIso = rangeBoundToIso(since, 'start');
  const untilIso = rangeBoundToIso(until, 'end');
  if (sinceIso && time < new Date(sinceIso).getTime()) return false;
  if (untilIso && time > new Date(untilIso).getTime()) return false;
  return true;
}

export function rangeLabel({ since, until }) {
  const start = since ? since.slice(0, 10) : 'beginning';
  const end = until ? until.slice(0, 10) : 'now';
  return `${start}_to_${end}`;
}
