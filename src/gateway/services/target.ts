// Target service for gateway

import type { TargetConfig } from '@/shared/types';
import { logDebug } from '@/shared/utils/logging';
import { KV_TARGET } from '@/shared/utils/kv';

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
  // Get all target configs from KV
  const targetsList = await KV_TARGET.get<string[]>('targets:list', env);

  if (!targetsList || targetsList.length === 0) {
    logDebug('target', 'No target configurations found');
    return null;
  }

  // Try to find a matching target
  for (const targetId of targetsList) {
    // Get target config from KV
    const config = await KV_TARGET.get<TargetConfig>(targetId, env);

    if (!config) {
      continue; // Skip if not found
    }

    const isMatch = matchTargetPattern(path, config);

    if (isMatch) {
      return config;
    }
  }

  return null;
}
