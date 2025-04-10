// KV database access layer with optimized operations for Cloudflare KV
import type { Env } from '@/shared/types';
import { logDebug } from './logging';

// Default TTL for cached values (5 minutes)
const DEFAULT_CACHE_TTL = 300;

/**
 * Gets a string value from KV store, optimized for performance
 * String values are faster than JSON in Workers
 */
export async function getStringValue(key: string, env: Env): Promise<string | null> {
	try {
		return await env.APIKI_KV.get(key);
	} catch (error) {
		logDebug('kv', `Error retrieving string ${key}`, { error });
		return null;
	}
}

/**
 * Gets a value from KV store with type casting
 * Use for complex objects only - string values are faster
 */
export async function getValue<T>(key: string, env: Env): Promise<T | null> {
	try {
		return (await env.APIKI_KV.get(key, { type: 'json' })) as T | null;
	} catch (error) {
		logDebug('kv', `Error retrieving ${key}`, { error });
		return null;
	}
}

/**
 * Puts a string value into KV store - fastest option
 */
export async function putStringValue(key: string, value: string, env: Env, ttl?: number): Promise<boolean> {
	try {
		const options = ttl ? { expirationTtl: ttl } : undefined;
		await env.APIKI_KV.put(key, value, options);
		return true;
	} catch (error) {
		logDebug('kv', `Error storing string ${key}`, { error });
		return false;
	}
}

/**
 * Puts a value into KV store
 * For non-string values, this will JSON.stringify them
 */
export async function putValue(key: string, value: any, env: Env, ttl?: number): Promise<boolean> {
	try {
		const options = ttl ? { expirationTtl: ttl } : undefined;
		const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
		await env.APIKI_KV.put(key, stringValue, options);
		return true;
	} catch (error) {
		logDebug('kv', `Error storing ${key}`, { error });
		return false;
	}
}

/**
 * Deletes a value from KV store
 */
export async function deleteValue(key: string, env: Env): Promise<boolean> {
	try {
		await env.APIKI_KV.delete(key);
		return true;
	} catch (error) {
		logDebug('kv', `Error deleting ${key}`, { error });
		return false;
	}
}

/**
 * Perform a batch update operation, optimized for Workers
 * Much more efficient than individual writes
 */
export async function batchUpdate(operations: { key: string; value: string | null }[], env: Env, ttl?: number): Promise<boolean> {
	try {
		const promises = operations.map(({ key, value }) => {
			if (value === null) {
				return env.APIKI_KV.delete(key);
			} else {
				const options = ttl ? { expirationTtl: ttl } : undefined;
				return env.APIKI_KV.put(key, value, options);
			}
		});

		await Promise.all(promises);
		return true;
	} catch (error) {
		logDebug('kv', `Error in batch update`, { error, operations: operations.length });
		return false;
	}
}

/**
 * Helper class to prefix keys by domain with optimized methods
 */
export class KeyPrefix {
	private prefix: string;

	constructor(prefix: string) {
		this.prefix = prefix;
	}

	key(id: string): string {
		return `${this.prefix}:${id}`;
	}

	// Get JSON data
	async get<T>(id: string, env: Env): Promise<T | null> {
		return getValue<T>(this.key(id), env);
	}

	// Get string data (faster)
	async getString(id: string, env: Env): Promise<string | null> {
		return getStringValue(this.key(id), env);
	}

	// Store JSON data
	async put(id: string, value: any, env: Env, ttl?: number): Promise<boolean> {
		return putValue(this.key(id), value, env, ttl);
	}

	// Store string data (faster)
	async putString(id: string, value: string, env: Env, ttl?: number): Promise<boolean> {
		return putStringValue(this.key(id), value, env, ttl);
	}

	async delete(id: string, env: Env): Promise<boolean> {
		return deleteValue(this.key(id), env);
	}

	// Batch operations with the same prefix
	async batchUpdate(operations: { id: string; value: string | null }[], env: Env, ttl?: number): Promise<boolean> {
		return batchUpdate(
			operations.map((op) => ({
				key: this.key(op.id),
				value: op.value,
			})),
			env,
			ttl
		);
	}
}

// Common key prefixes
export const KeyPrefixes = {
	CLIENT: new KeyPrefix('client'),
	API_KEY: new KeyPrefix('apikey'),
	CREDITS: new KeyPrefix('credits'),
	TARGET: new KeyPrefix('target'),
	EMAIL: new KeyPrefix('email'),
	USAGE: new KeyPrefix('usage'),
	KEY_USAGE: new KeyPrefix('keyusage'),
	CLIENT_KEYS: new KeyPrefix('client:keys'),
};
