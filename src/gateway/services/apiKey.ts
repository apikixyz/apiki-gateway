// API Key service for gateway (validation only)

import type { ApiKeyData } from '@/shared/types';
import { logDebug } from '@/shared/utils/logging';
import { KV_API_KEY } from '@/shared/utils/kv';

/**
 * Validate API key - core gateway functionality
 */
export async function validateApiKey(apiKey: string, env: Env): Promise<ApiKeyData | null> {
  // Get API key data from KV
  logDebug('validateApiKey', `Getting API key data from KV`, { apiKey });
  const keyData = await KV_API_KEY.get<ApiKeyData>(apiKey, env);
  if (!keyData) return null;

  // Check if key has expired
  if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) return null;

  // Check if key is inactive
  if (!keyData.active) return null;

  return keyData;
}
