// Simple in-memory cache to reduce KV reads
interface CacheEntry<T> {
	value: T;
	expiry: number;
}

export class SimpleCache {
	private cache: Map<string, CacheEntry<any>> = new Map();
	private readonly DEFAULT_TTL = 60000; // 1 minute in ms

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);

		if (!entry) return null;
		if (entry.expiry < Date.now()) {
			this.cache.delete(key);
			return null;
		}

		return entry.value as T;
	}

	set<T>(key: string, value: T, ttl = this.DEFAULT_TTL): void {
		const expiry = Date.now() + ttl;
		this.cache.set(key, { value, expiry });
	}

	delete(key: string): void {
		this.cache.delete(key);
	}
}
