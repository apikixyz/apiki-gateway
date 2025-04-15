// API Key management service for admin

import type { ApiKeyData, ApiKeyOptions } from '@/shared/types';
import { generateApiKey } from '@/shared/utils/crypto';
import { logDebug } from '@/shared/utils/logging';
import { KV_API_KEY, KV_CLIENT_KEYS } from '@/shared/utils/kv';

// Initialize a cache for client keys to reduce KV reads
const clientKeysCache = new Map<string, string[]>();
const CACHE_TTL = 300000; // 5 minutes

/**
 * List all API keys
 */
export async function listApiKeys(env: Env): Promise<{ id: string; data: ApiKeyData }[]> {
  try {
    // Get all keys with the API_KEY prefix - get the prefix string from a test key
    const prefix = KV_API_KEY.key('').split(':')[0] + ':';
    const keys = await env.APIKI_KV.list({ prefix });

    // Get the data for each key - use Promise.all for parallel processing
    const apiKeys = await Promise.all(
      keys.keys.map(async (key) => {
        // Extract the key ID from the full KV key name
        const id = key.name.substring(prefix.length);
        const data = await KV_API_KEY.get<ApiKeyData>(id, env);
        return { id, data: data || null };
      })
    );

    // Filter out any keys with null data (should not happen, but just in case)
    return apiKeys.filter((key) => key.data !== null) as { id: string; data: ApiKeyData }[];
  } catch (error) {
    console.error('Error listing API keys:', error);
    return [];
  }
}

/**
 * Get an API key by its ID
 */
export async function getApiKey(apiKeyId: string, env: Env): Promise<ApiKeyData | null> {
  try {
    return await KV_API_KEY.get<ApiKeyData>(apiKeyId, env);
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
}

/**
 * Create a new API key
 */
export async function createApiKey(clientId: string, options: ApiKeyOptions, env: Env): Promise<{ apiKey: string; data: ApiKeyData }> {
  try {
    // Generate a random API key using shared crypto utility
    const apiKey = generateApiKey();

    // Prepare API key data
    const apiKeyData: ApiKeyData = {
      clientId,
      active: true,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt || null,
      restrictions: options.restrictions || {},
    };

    // Cache invalidation
    if (clientKeysCache.has(clientId)) {
      clientKeysCache.delete(clientId);
    }

    // Store the API key
    await KV_API_KEY.put(apiKey, apiKeyData, env);

    // Add this key to the client's list of keys
    const clientKeys = await getClientKeys(clientId, env);

    // Avoid duplicate keys
    if (!clientKeys.includes(apiKey)) {
      clientKeys.push(apiKey);
      await KV_CLIENT_KEYS.put(clientId, clientKeys, env);
    }

    logDebug('admin', `Created new API key for client ${clientId}`);

    return { apiKey, data: apiKeyData };
  } catch (error) {
    console.error('Error creating API key:', error);
    throw error;
  }
}

/**
 * Update an API key
 */
export async function updateApiKey(apiKeyId: string, updates: Partial<ApiKeyData>, env: Env): Promise<ApiKeyData | null> {
  try {
    // Get the current API key data
    const currentData = await KV_API_KEY.get<ApiKeyData>(apiKeyId, env);

    if (!currentData) {
      return null;
    }

    // Update the data
    const updatedData: ApiKeyData = {
      ...currentData,
      ...updates,
      // Don't allow client ID to be changed
      clientId: currentData.clientId,
      // Don't allow creation date to be changed
      createdAt: currentData.createdAt,
    };

    // Store the updated API key
    await KV_API_KEY.put(apiKeyId, updatedData, env);

    logDebug('admin', `Updated API key ${apiKeyId}`);

    return updatedData;
  } catch (error) {
    console.error('Error updating API key:', error);
    return null;
  }
}

/**
 * Delete an API key
 */
export async function deleteApiKey(apiKeyId: string, env: Env): Promise<boolean> {
  try {
    // Get the API key data first (to get the client ID)
    const apiKeyData = await KV_API_KEY.get<ApiKeyData>(apiKeyId, env);

    if (!apiKeyData) {
      return false;
    }

    // Delete the API key
    await KV_API_KEY.delete(apiKeyId, env);

    // Cache invalidation
    const clientId = apiKeyData.clientId;
    if (clientKeysCache.has(clientId)) {
      clientKeysCache.delete(clientId);
    }

    // Remove this key from the client's list of keys
    const clientKeys = await getClientKeys(clientId, env);
    const updatedKeys = clientKeys.filter((key) => key !== apiKeyId);

    // Only update if there's a change
    if (clientKeys.length !== updatedKeys.length) {
      await KV_CLIENT_KEYS.put(clientId, updatedKeys, env);
    }

    logDebug('admin', `Deleted API key ${apiKeyId}`);

    return true;
  } catch (error) {
    console.error('Error deleting API key:', error);
    return false;
  }
}

/**
 * Get client keys with caching
 */
async function getClientKeys(clientId: string, env: Env): Promise<string[]> {
  // Check cache first
  if (clientKeysCache.has(clientId)) {
    return clientKeysCache.get(clientId) || [];
  }

  // Get from KV
  const clientKeys = (await KV_CLIENT_KEYS.get<string[]>(clientId, env)) || [];

  // Cache the result
  clientKeysCache.set(clientId, clientKeys);

  // Set timeout to clear cache
  setTimeout(() => {
    clientKeysCache.delete(clientId);
  }, CACHE_TTL);

  return clientKeys;
}
