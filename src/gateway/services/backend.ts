// Backend service for gateway
import { BackendConfig, Env } from '../../shared/types';
import { SimpleCache } from '../../shared/utils/cache';
import { logDebug } from '../../shared/utils/logging';
import { KeyPrefixes, getValue } from '../../shared/utils/kv';

// Initialize backend caches
const backendCache = new SimpleCache();
const backendsListCache = new SimpleCache();

/**
 * Match a request path against a backend pattern
 */
export function matchBackendPattern(path: string, config: BackendConfig): boolean {
	if (config.isRegex) {
		try {
			const regex = new RegExp(config.pattern);
			return regex.test(path);
		} catch (error) {
			console.error('Invalid regex pattern:', error);
			return false;
		}
	} else {
		// Simple path matching (supports wildcards at the end)
		if (config.pattern.endsWith('*')) {
			const prefix = config.pattern.slice(0, -1);
			return path.startsWith(prefix);
		}
		return path === config.pattern;
	}
}

/**
 * Find the appropriate backend configuration for a request path
 */
export async function findBackendConfig(path: string, env: Env): Promise<BackendConfig | null> {
	// Get all backend configs from cache first
	let backendsList = backendsListCache.get<string[]>('backends:list');

	// If not in cache, get from KV
	if (!backendsList) {
		backendsList = (await getValue<string[]>('backends:list', env)) ?? undefined;

		// Cache the list if found
		if (backendsList) {
			backendsListCache.set('backends:list', backendsList, 300000); // Cache for 5 minutes
		} else {
			logDebug('backend', 'No backend configurations found');
			return null;
		}
	}

	if (!backendsList || backendsList.length === 0) {
		logDebug('backend', 'No backend configurations found');
		return null;
	}

	// Try to find a matching backend
	for (const backendId of backendsList) {
		// Check cache first
		const cacheKey = `backend:${backendId}`;
		let config = backendCache.get<BackendConfig>(cacheKey);

		// If not in cache, get from KV
		if (!config) {
			config = (await KeyPrefixes.BACKEND.get<BackendConfig>(backendId, env)) ?? undefined;

			// Cache if found
			if (config) {
				backendCache.set(cacheKey, config, 300000); // Cache for 5 minutes
			} else {
				continue; // Skip if not found
			}
		}

		const isMatch = matchBackendPattern(path, config);

		if (isMatch) {
			return config;
		}
	}

	return null;
}
