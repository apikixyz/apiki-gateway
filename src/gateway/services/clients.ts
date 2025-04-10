// Client service for gateway (minimal version)
import type { ClientData, Env } from '@/shared/types';
import { SimpleCache } from '@/shared/utils/cache';
import { KeyPrefixes } from '@/shared/utils/kv';

// Initialize client cache
const clientCache = new SimpleCache();

/**
 * Get client data - minimal implementation for gateway needs only
 */
export async function getClient(clientId: string, env: Env): Promise<ClientData | null> {
	// Check cache first for better performance
	const cacheKey = KeyPrefixes.CLIENT.key(clientId);
	const cachedClient = clientCache.get<ClientData>(cacheKey);
	if (cachedClient) {
		return cachedClient;
	}

	// Get client data from KV
	const clientData = await KeyPrefixes.CLIENT.get<ClientData>(clientId, env);

	// Cache the result if found (improves gateway performance)
	if (clientData) {
		clientCache.set(cacheKey, clientData, 300000); // Cache for 5 minutes
	}

	return clientData;
}
