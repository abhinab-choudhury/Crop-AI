// In-memory rate limiter / cooldown store. Dev-appropriate; swap for Redis in prod.

interface StoreEntry {
  count?: number;
  until: number;
}

const store = new Map<string, StoreEntry>();

export function setCooldown(key: string, windowMs: number): void {
  store.set(key, { until: Date.now() + windowMs });
}

export function getCooldown(key: string): number {
  const entry = store.get(key);
  if (!entry) return 0;
  const remaining = entry.until - Date.now();
  if (remaining <= 0) {
    store.delete(key);
    return 0;
  }
  return remaining;
}

/** Returns the number of calls seen in the window (1-based). Caller compares to max. */
export function rateLimit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.until <= now) {
    store.set(key, { count: 1, until: now + windowMs });
    return 1;
  }

  entry.count = (entry.count ?? 0) + 1;
  store.set(key, entry);
  return entry.count;
}
