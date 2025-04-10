// Target service for gateway
import type { TargetConfig, Env } from '@/shared/types';
import { SimpleCache } from '@/shared/utils/cache';
import { logDebug } from '@/shared/utils/logging';
import { KeyPrefixes, getValue } from '@/shared/utils/kv';

// Initialize target caches
const targetCache = new SimpleCache();
const targetsListCache = new SimpleCache();

/**
 * Match a request path against a target pattern
 */
export function matchTargetPattern(path: string, config: TargetConfig): boolean {
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
 * Find the appropriate target configuration for a request path
 */
export async function findTargetConfig(path: string, env: Env): Promise<TargetConfig | null> {
	// Get all target configs from cache first
	let targetsList = targetsListCache.get<string[]>('targets:list');

	// If not in cache, get from KV
	if (!targetsList) {
		targetsList = (await getValue<string[]>('targets:list', env)) ?? undefined;

		// Cache the list if found
		if (targetsList) {
			targetsListCache.set('targets:list', targetsList, 300000); // Cache for 5 minutes
		} else {
			logDebug('target', 'No target configurations found');
			return null;
		}
	}

	if (!targetsList || targetsList.length === 0) {
		logDebug('target', 'No target configurations found');
		return null;
	}

	// Try to find a matching target
	for (const targetId of targetsList) {
		// Check cache first
		const cacheKey = `target:${targetId}`;
		let config = targetCache.get<TargetConfig>(cacheKey);

		// If not in cache, get from KV
		if (!config) {
			config = (await KeyPrefixes.TARGET.get<TargetConfig>(targetId, env)) ?? undefined;

			// Cache if found
			if (config) {
				targetCache.set(cacheKey, config, 300000); // Cache for 5 minutes
			} else {
				continue; // Skip if not found
			}
		}

		const isMatch = matchTargetPattern(path, config);

		if (isMatch) {
			return config;
		}
	}

	return null;
}
