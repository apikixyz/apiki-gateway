import { BackendConfig, Env } from '../types';
import { SimpleCache } from '../utils/cache';
import { logDebug } from '../utils/logging';

// Initialize backend caches
const backendCache = new SimpleCache();
const backendsListCache = new SimpleCache();

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

export async function findBackendConfig(path: string, env: Env): Promise<BackendConfig | null> {
	// Get all backend configs from cache first
	let backendsList = backendsListCache.get<string[]>('backends:list');

	// If not in cache, get from KV
	if (!backendsList) {
		backendsList = (await env.APIKI_KV.get('backends:list', { type: 'json' })) as string[] | null;

		// Cache the list if found
		if (backendsList) {
			backendsListCache.set('backends:list', backendsList, 300000); // Cache for 5 minutes
		} else {
			logDebug('backend', 'No backend configurations found');
			return null;
		}
	}

	if (backendsList.length === 0) {
		logDebug('backend', 'No backend configurations found');
		return null;
	}

	logDebug('backend', `Searching for backend match`, {
		path,
		backendCount: backendsList.length,
	});

	// Try to find a matching backend
	for (const backendId of backendsList) {
		// Check cache first
		const cacheKey = `backend:${backendId}`;
		let config = backendCache.get<BackendConfig>(cacheKey);

		// If not in cache, get from KV
		if (!config) {
			config = (await env.APIKI_KV.get(cacheKey, { type: 'json' })) as BackendConfig | null;

			// Cache if found
			if (config) {
				backendCache.set(cacheKey, config, 300000); // Cache for 5 minutes
			} else {
				continue; // Skip if not found
			}
		}

		const isMatch = matchBackendPattern(path, config);
		logDebug('backend', `Testing backend pattern`, {
			backendId: config.id,
			pattern: config.pattern,
			isMatch,
		});

		if (isMatch) {
			return config;
		}
	}

	return null;
}
