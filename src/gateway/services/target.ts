import { targets } from '@/config/targets';
import type { TargetConfig } from '@/shared/types';
import { logDebug } from '@/shared/utils/logging';

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

    // Exact matching with trailing slash
    if (config.pattern.endsWith('/')) {
      const pattern = config.pattern.slice(0, -1);
      return path === pattern;
    }

    return path === config.pattern;
  }
}

/**
 * Get the appropriate target configuration by targetId
 */
export function getTargetConfig(targetId: string): TargetConfig | null {
  if (!targets || targets.length === 0) {
    logDebug('target', 'No target configurations found');
    return null;
  }

  const target = targets.find((target) => target.id === targetId);
  if (!target) {
    logDebug('target', `Target ${targetId} not found`);
    return null;
  }

  return target;
}
