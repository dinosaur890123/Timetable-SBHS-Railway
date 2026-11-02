// Lightweight in-memory cache with TTL
// Designed to cache API responses without hoarding resources

class Cache {
  constructor(defaultTTL = 5 * 60 * 1000) { // 5 minutes default TTL
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  // Generate cache key from arguments
  _makeKey(prefix, ...args) {
    return `${prefix}:${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(':')}`;
  }

  // Get cached value if exists and not expired
  get(prefix, ...args) {
    const key = this._makeKey(prefix, ...args);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  // Set value in cache with optional custom TTL
  set(prefix, data, ttl = this.defaultTTL, ...args) {
    const key = this._makeKey(prefix, ...args);
    
    // Limit cache size to prevent hoarding (max 50 entries)
    if (this.cache.size >= 50) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }

  // Clear all cache entries
  clear() {
    this.cache.clear();
  }

  // Clear entries matching a prefix
  clearPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix + ':')) {
        this.cache.delete(key);
      }
    }
  }

  // Get current cache size
  get size() {
    return this.cache.size;
  }
}

// Export singleton instance
export const clipboardCache = new Cache(5 * 60 * 1000); // 5 minute TTL for clipboard data
