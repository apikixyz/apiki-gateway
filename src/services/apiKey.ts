import { ApiKeyData, ApiKeyOptions, Env } from '../types';
import { SimpleCache } from '../utils/cache';
import { logDebug } from '../utils/logging';

// Initialize API key cache
const apiKeyCache = new SimpleCache();

export async function validateApiKey(apiKey: string, env: Env): Promise<ApiKeyData | null> {
	// Check cache first
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
	const keyData = (await env.APIKI_KV.get(`apikey:${apiKey}`, { type: 'json' })) as ApiKeyData | null;
	if (!keyData) return null;

	// Cache the result (only if active - no need to cache inactive keys)
	if (keyData.active) {
		// Don't cache expired keys
		if (!keyData.expiresAt || new Date(keyData.expiresAt) >= new Date()) {
			apiKeyCache.set(cacheKey, keyData);
		}
	}

	// Check if key is active
	if (!keyData.active) return null;

	// Check if key has expired
	if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
		return null;
	}

	// Track API key usage - don't wait for this
	trackApiKeyUsage(apiKey, env).catch((err) => console.error('Error tracking API key usage:', err));

	return keyData;
}

export async function createApiKey(userId: string, options: ApiKeyOptions = {}, env: Env): Promise<{ apiKey: string } & ApiKeyData> {
	// Generate a secure API key with more entropy (32 bytes instead of 16)
	const buffer = new Uint8Array(32);
	crypto.getRandomValues(buffer);

	// Create a more readable key format: apk_[base64url]
	const base64 = btoa(String.fromCharCode(...buffer))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
	const apiKey = `apk_${base64}`;

	// Create API key data
	const keyData: ApiKeyData = {
		userId,
		active: true,
		createdAt: new Date().toISOString(),
		expiresAt: options.expiresAt || null,
		restrictions: options.restrictions || {},
	};

	// Store API key
	await env.APIKI_KV.put(`apikey:${apiKey}`, JSON.stringify(keyData));

	// Link API key to user
	const userKeysKey = `keys:${userId}`;
	const userKeys = JSON.parse((await env.APIKI_KV.get(userKeysKey)) || '[]');
	userKeys.push({
		key: apiKey,
		name: options.name || 'API Key',
		createdAt: keyData.createdAt,
	});

	await env.APIKI_KV.put(userKeysKey, JSON.stringify(userKeys));

	return { apiKey, ...keyData };
}

export async function deactivateApiKey(apiKey: string, env: Env): Promise<boolean> {
	// Get API key data
	const keyData = (await env.APIKI_KV.get(`apikey:${apiKey}`, { type: 'json' })) as ApiKeyData | null;
	if (!keyData) return false;

	// Update to inactive
	keyData.active = false;

	// Save updated key data
	await env.APIKI_KV.put(`apikey:${apiKey}`, JSON.stringify(keyData));

	return true;
}

export async function trackApiKeyUsage(apiKey: string, env: Env): Promise<void> {
	// Track usage for analytics
	const today = new Date().toISOString().split('T')[0];
	const keyUsageKey = `keyusage:${apiKey}:${today}`;

	// Increment counter
	const currentCount = parseInt((await env.APIKI_KV.get(keyUsageKey)) || '0');
	await env.APIKI_KV.put(keyUsageKey, (currentCount + 1).toString(), {
		// Store daily usage for 90 days
		expirationTtl: 90 * 24 * 60 * 60,
	});
}
