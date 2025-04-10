/**
 * Optimized memory cache implementation for Cloudflare Workers
 */

// Defining a cache entry that supports expiration
interface CacheEntry<T> {
	value: T;
	expires?: number; // Timestamp when this entry expires
}

/**
 * Simple in-memory cache with expiration support
 * Optimized for Cloudflare Workers
 */
export class SimpleCache {
	private cache: Map<string, CacheEntry<any>>;
	private maxSize: number;
	private defaultTtl: number;

	/**
	 * Create a new cache
	 * @param maxSize Maximum number of entries (default: 1000)
	 * @param defaultTtl Default TTL in milliseconds (default: 5 minutes)
	 */
	constructor(maxSize = 1000, defaultTtl = 300000) {
		this.cache = new Map();
		this.maxSize = maxSize;
		this.defaultTtl = defaultTtl;

		// Auto cleanup expired entries every minute
		// This helps prevent memory leaks in long-running workers
		setInterval(() => this.cleanupExpired(), 60000);
	}

	/**
	 * Get a value from the cache
	 * @param key Cache key
	 * @returns The cached value or undefined if not found or expired
	 */
	get<T>(key: string): T | undefined {
		const entry = this.cache.get(key);

		if (!entry) {
			return undefined;
		}

		// Check if expired
		if (entry.expires && entry.expires < Date.now()) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.value as T;
	}

	/**
	 * Set a value in the cache
	 * @param key Cache key
	 * @param value Value to cache
	 * @param ttl Time to live in milliseconds (optional, uses default if not provided)
	 */
	set(key: string, value: any, ttl?: number): void {
		// Ensure we don't exceed maximum size
		if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
			this.evictOldest();
		}

		const expires = ttl ? Date.now() + ttl : Date.now() + this.defaultTtl;

		this.cache.set(key, {
			value,
			expires
		});
	}

	/**
	 * Check if a key exists in the cache and is not expired
	 * @param key Cache key
	 * @returns True if the key exists and is not expired
	 */
	has(key: string): boolean {
		const entry = this.cache.get(key);

		if (!entry) {
			return false;
		}

		// Check if expired
		if (entry.expires && entry.expires < Date.now()) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Delete a key from the cache
	 * @param key Cache key
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clear the entire cache
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get current cache size
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * Remove all expired entries from the cache
	 * @internal
	 */
	private cleanupExpired(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (entry.expires && entry.expires < now) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Evict the oldest entry in the cache
	 * @internal
	 */
	private evictOldest(): void {
		// Simple LRU: delete the first key
		if (this.cache.size > 0) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}
	}
}
