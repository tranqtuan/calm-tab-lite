/** Small, dependency-free helpers shared by the page and the service worker. */

/** Local date key, e.g. "2026-10-27". */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days since the Unix epoch in local time — stable "day number" for daily rotation. */
export function dayNumber(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(local / 86400000);
}

/** The last `n` day keys, oldest first. */
export function lastDays(n, from = new Date()) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

/** Hostname without "www.", or null for non-web URLs. */
export function domainOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Resolve a domain's category by walking up its suffixes: overrides first, then defaults. */
export function categoryFor(domain, overrides = {}, defaults = {}) {
  if (!domain) return 'Other';
  if (domain.endsWith('#ai')) return 'Learning'; // read from the AI News tab

  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (overrides[candidate]) return overrides[candidate];
    if (defaults[candidate]) return defaults[candidate];
  }
  return 'Other';
}

/** "1h 24m", "12m", "45s". */
export function formatDuration(seconds) {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(timestamp, now = Date.now()) {
  const diff = Math.max(0, (now - timestamp) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Accept only http(s) links from untrusted sources (RSS, calendar). */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Display name for a tracked key ("theverge.com#ai" → "theverge.com · AI News"). */
export const siteLabel = (key) => (key.endsWith('#ai') ? `${key.slice(0, -3)} · AI News` : key);
