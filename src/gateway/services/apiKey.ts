// API Key service for gateway (validation only)

import type { ApiKeyData } from '@/shared/types';
import { SimpleCache } from '@/shared/utils/cache';
import { logDebug } from '@/shared/utils/logging';
import { KV_API_KEY, KV_KEY_USAGE } from '@/shared/utils/kv';

// Initialize API key cache
const apiKeyCache = new SimpleCache();

/**
 * Validate API key - core gateway functionality
 */
export async function validateApiKey(apiKey: string, env: Env): Promise<ApiKeyData | null> {
  // Check cache first for better performance
  const cacheKey = `apikey:${apiKey}`;
  const cachedData = apiKeyCache.get<ApiKeyData>(cacheKey);
  if (cachedData) {
    // If key is already cached and not active, return null
    if (!cachedData.active) return null;

    // Check expiry for cached key
    if (cachedData.expiresAt && new Date(cachedData.expiresAt) < new Date()) {
      apiKeyCache.delete(cacheKey);
      return null;
    }

    // Track API key usage - don't wait for this
    trackApiKeyUsage(apiKey, env).catch((err) => console.error('Error tracking API key usage:', err));
    return cachedData;
  }

  // Get API key data from KV
  logDebug('validateApiKey', `Getting API key data from KV`, { apiKey });
  const keyData = await KV_API_KEY.get<ApiKeyData>(apiKey, env);
  if (!keyData) return null;

  // Check if key has expired
  if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) return null;

  // Check if key is inactive
  if (!keyData.active) return null;

  // Cache the result (only if active - no need to cache inactive keys)
  apiKeyCache.set(cacheKey, keyData, 300000); // Cache for 5 minutes

  // Track API key usage - don't wait for this
  trackApiKeyUsage(apiKey, env).catch((err) => console.error('Error tracking API key usage:', err));

  return keyData;
}

/**
 * Track API key usage - minimal implementation for performance
 */
async function trackApiKeyUsage(apiKey: string, env: Env): Promise<void> {
  // Track usage for analytics - efficiently
  const today = new Date().toISOString().split('T')[0];
  const keyUsageKey = KV_KEY_USAGE.key(`${apiKey}:${today}`);

  // Increment counter
  try {
    // Get the current value without type:json for better performance
    let currentUsage = parseInt((await KV_KEY_USAGE.getString(keyUsageKey, env)) || '0');
    currentUsage++; // Increment

    // Store with expiration
    const ttl = 90 * 24 * 60 * 60; // Store daily usage for 90 days
    await KV_KEY_USAGE.putString(keyUsageKey, currentUsage.toString(), env, ttl);
  } catch (error) {
    // Non-blocking error handling (logging only)
    logDebug('trackApiKeyUsage', 'Error tracking usage', { error });
  }
}
