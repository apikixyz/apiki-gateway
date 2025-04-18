// KV database access layer with optimized operations for Cloudflare KV

import { logDebug } from './logging';

/**
 * Gets a string value from KV store, optimized for performance
 * String values are faster than JSON in Workers
 */
async function getStringValue(key: string, env: Env): Promise<string | null> {
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
async function getValue<T>(key: string, env: Env): Promise<T | null> {
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
async function putStringValue(key: string, value: string, env: Env, ttl?: number): Promise<boolean> {
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
async function putValue(key: string, value: any, env: Env, ttl?: number): Promise<boolean> {
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
async function deleteValue(key: string, env: Env): Promise<boolean> {
  try {
    await env.APIKI_KV.delete(key);
    return true;
  } catch (error) {
    logDebug('kv', `Error deleting ${key}`, { error });
    return false;
  }
}

/**
 * Helper class to prefix keys by domain with optimized methods
 */
class KeyPrefix {
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
}

// Export key prefixes with optimized methods
export const KV_API_KEY = new KeyPrefix('apikey');
export const KV_CLIENT = new KeyPrefix('client');
export const KV_CLIENT_KEYS = new KeyPrefix('client:keys');
export const KV_CREDITS = new KeyPrefix('credits');
export const KV_EMAIL = new KeyPrefix('email');
export const KV_TARGET = new KeyPrefix('target');
