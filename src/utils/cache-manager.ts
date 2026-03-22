/**
 * Cache Manager
 * Handles cache storage and eviction
 */

interface CacheEntry {
  value: any;
  timestamp: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private maxAge = 3600000; // 1 hour

  set(key: string, value: any): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  clear(): void {
    this.cache.clear();
  }

  // Evict old entries
  evict(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

export default CacheManager;
