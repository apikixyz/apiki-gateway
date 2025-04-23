import type { ApiKeyConfig } from '@/shared/types';
import { generateApiKey } from '@/shared/utils/crypto';
import { KV_API_KEY } from '@/shared/utils/kv';
import { logDebug } from '@/shared/utils/logging';

/**
 * Get an API key by its ID
 */
export async function getApiKey(apiKeyId: string, env: Env): Promise<ApiKeyConfig | null> {
  try {
    return await KV_API_KEY.get<ApiKeyConfig>(apiKeyId, env);
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
}

/**
 * Create a new API key for a client
 */
export async function createApiKey(
  clientId: string,
  options: Pick<ApiKeyConfig, 'expiresAt' | 'targetId'>,
  env: Env
): Promise<ApiKeyConfig> {
  try {
    // Generate a random API key using shared crypto utility
    const apiKey = generateApiKey();

    // Prepare API key data
    const apiKeyData: ApiKeyConfig = {
      clientId,
      active: true,
      expiresAt: options.expiresAt || null,
      targetId: options.targetId,
    };

    // Store the API key
    await KV_API_KEY.put(apiKey, apiKeyData, env);

    logDebug('admin', `Created new API key for client ${clientId}`);

    return apiKeyData;
  } catch (error) {
    console.error('Error creating API key:', error);
    throw error;
  }
}

/**
 * Update an API key
 */
export async function updateApiKey(
  apiKeyId: string,
  updates: Pick<ApiKeyConfig, 'active' | 'expiresAt'>,
  env: Env
): Promise<ApiKeyConfig | null> {
  try {
    // Get the current API key data
    const currentData = await KV_API_KEY.get<ApiKeyConfig>(apiKeyId, env);

    if (!currentData) {
      return null;
    }

    // Update the data
    const updatedData: ApiKeyConfig = {
      ...currentData,
      ...updates,
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
    const apiKeyData = await KV_API_KEY.get<ApiKeyConfig>(apiKeyId, env);

    if (!apiKeyData) {
      return false;
    }

    // Delete the API key
    await KV_API_KEY.delete(apiKeyId, env);

    logDebug('admin', `Deleted API key ${apiKeyId}`);

    return true;
  } catch (error) {
    console.error('Error deleting API key:', error);
    return false;
  }
}
