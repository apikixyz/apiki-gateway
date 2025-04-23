import type { ApiKeyConfig } from '@/shared/types';
import { generateApiKey } from '@/shared/utils/crypto';
import { KV_API_KEY } from '@/shared/utils/kv';
import { logDebug } from '@/shared/utils/logging';

/**
 * Get an API key config
 */
export async function getApiKeyConfig(apiKey: string, env: Env): Promise<ApiKeyConfig | null> {
  try {
    return await KV_API_KEY.get<ApiKeyConfig>(apiKey, env);
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
}

/**
 * Create a new API key config for a client
 */
export async function createApiKeyConfig(
  clientId: string,
  options: Pick<ApiKeyConfig, 'expiresAt' | 'targetId'>,
  env: Env
): Promise<ApiKeyConfig & { apiKey: string }> {
  try {
    // Generate a random API key using shared crypto utility
    const apiKey = generateApiKey();

    // Prepare API key data
    const apiKeyConfig: ApiKeyConfig = {
      clientId,
      active: true,
      expiresAt: options.expiresAt || null,
      targetId: options.targetId,
    };

    // Store the API key config
    await KV_API_KEY.put(apiKey, apiKeyConfig, env);

    logDebug('admin', `Created new API key config for client ${clientId}`);

    return {
      apiKey,
      ...apiKeyConfig,
    };
  } catch (error) {
    console.error('Error creating API key config:', error);
    throw error;
  }
}

/**
 * Update an API key
 */
export async function updateApiKeyConfig(
  apiKey: string,
  updates: Pick<ApiKeyConfig, 'active' | 'expiresAt'>,
  env: Env
): Promise<ApiKeyConfig | null> {
  try {
    // Get the current API key config
    const currentData = await KV_API_KEY.get<ApiKeyConfig>(apiKey, env);

    if (!currentData) {
      return null;
    }

    // Update the data
    const updatedData: ApiKeyConfig = {
      ...currentData,
      ...updates,
    };

    // Store the updated API key config
    await KV_API_KEY.put(apiKey, updatedData, env);

    logDebug('admin', `Updated API key config for client ${currentData.clientId}`);

    return updatedData;
  } catch (error) {
    console.error('Error updating API key config:', error);
    return null;
  }
}

/**
 * Delete an API key
 */
export async function deleteApiKeyConfig(apiKey: string, env: Env): Promise<boolean> {
  try {
    // Get the API key data first (to get the client ID)
    const apiKeyData = await KV_API_KEY.get<ApiKeyConfig>(apiKey, env);

    if (!apiKeyData) {
      return false;
    }

    // Delete the API key
    await KV_API_KEY.delete(apiKey, env);

    logDebug('admin', `Deleted API key config for client ${apiKeyData.clientId}`);

    return true;
  } catch (error) {
    console.error('Error deleting API key config:', error);
    return false;
  }
}
