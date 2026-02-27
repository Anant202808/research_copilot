/**
 * Client-side AI result caching via sessionStorage.
 * Avoids re-processing the same data within a session.
 */

const CACHE_PREFIX = 'rg_cache_';
const MAX_CACHE_ENTRIES = 50;

export function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: T; ts: number };
    // Expire after 30 minutes
    if (Date.now() - entry.ts > 30 * 60 * 1000) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T): void {
  try {
    // Evict oldest if at capacity
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length >= MAX_CACHE_ENTRIES) {
      sessionStorage.removeItem(keys[0]);
    }
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage full or unavailable — silently fail
  }
}

export function clearCache(): void {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  keys.forEach(k => sessionStorage.removeItem(k));
}

export function makeCacheKey(...parts: string[]): string {
  return parts.join('_').replace(/\s+/g, '_').toLowerCase().slice(0, 100);
}
