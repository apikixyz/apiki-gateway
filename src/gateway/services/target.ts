import { targets } from '@/config/targets';
import type { TargetConfig } from '@/shared/types';
import { logDebug } from '@/shared/utils/logging';

/**
 * Get the appropriate target configuration by targetId
 */
export function getTargetConfig(targetId: string): TargetConfig | null {
  if (!targets?.length) {
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

/**
 * Match a request path against a target pattern
 */
export function matchTargetPattern(path: string, config: TargetConfig): boolean {
  // Handle regex patterns
  if (config.isRegex) {
    try {
      return new RegExp(config.pattern).test(path);
    } catch (error) {
      console.error('Invalid regex pattern:', error);
      return false;
    }
  }

  // Handle wildcard patterns (e.g., /api/*)
  if (config.pattern.endsWith('*')) {
    const basePath = config.pattern.slice(0, -1);
    const basePathNoSlash = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

    // Handle exact match with base path
    if (path === basePath || path === basePathNoSlash) {
      return true;
    }

    // Handle path that starts with base path
    return path.startsWith(basePath);
  }

  // Handle trailing slash in pattern
  if (config.pattern.endsWith('/')) {
    return path === config.pattern.slice(0, -1) || path === config.pattern;
  }

  // Exact match
  return path === config.pattern;
}

/**
 * Extracts the relative path from the original path based on the target pattern
 */
export function extractRelativePath(path: string, config: TargetConfig): string {
  // Normalize path by removing trailing slash (except for root path)
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  // Handle regex patterns
  if (config.isRegex && config.pattern.startsWith('^/') && config.pattern.includes('/.*')) {
    const basePath = config.pattern.substring(1, config.pattern.indexOf('/.*')).replace(/\\/g, '');

    // Path exactly matches base path
    if (normalizedPath === basePath || normalizedPath === basePath + '/') {
      return '/';
    }

    // Extract part after base path
    if (normalizedPath.startsWith(basePath)) {
      return normalizedPath.substring(basePath.length) || '/';
    }

    return normalizedPath;
  }

  // Handle wildcard patterns
  if (!config.isRegex && config.pattern.endsWith('*')) {
    const basePath = config.pattern.slice(0, -1);

    // Path exactly matches base path
    if (normalizedPath === basePath || normalizedPath === basePath.slice(0, -1)) {
      return '/';
    }

    // Extract part after base path
    if (normalizedPath.startsWith(basePath)) {
      const relativePath = normalizedPath.substring(basePath.length);
      return relativePath.startsWith('/') ? relativePath : '/' + relativePath;
    }
  }

  // Default case for exact matches
  return '/';
}
