import { targets } from '@/config/targets';
import type { TargetConfig } from '@/shared/types';
import { logDebug } from '@/shared/utils/logging';

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
      const basePath = config.pattern.slice(0, -1); // Remove the wildcard

      // Exact match with the base path (without trailing slash)
      if (basePath.endsWith('/')) {
        if (path === basePath.slice(0, -1)) {
          return true;
        }
      } else {
        if (path === basePath) {
          return true;
        }
      }

      // Path starts with the base path
      return path.startsWith(basePath);
    }

    // Exact matching with trailing slash
    if (config.pattern.endsWith('/')) {
      const pattern = config.pattern.slice(0, -1);
      return path === pattern || path === config.pattern;
    }

    // Exact match
    return path === config.pattern;
  }
}

/**
 * Extracts the relative path from the original path based on the target pattern
 */
export function extractRelativePath(path: string, config: TargetConfig): string {
  // First, normalize the path by removing trailing slash if it exists
  // (except for the root path '/')
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  if (config.isRegex) {
    // For regex patterns like ^/target/.*$, extract the part after the base path
    if (config.pattern.startsWith('^/') && config.pattern.includes('/.*')) {
      // Extract the base path from the regex pattern
      const basePath = config.pattern.substring(1, config.pattern.indexOf('/.*')).replace(/\\/g, ''); // Remove any escape characters

      // If path exactly matches the base path (with or without trailing slash)
      if (normalizedPath === basePath || normalizedPath === basePath + '/') {
        return '/';
      }

      // Return the part after the base path, or '/' if nothing follows
      return normalizedPath.startsWith(basePath) ? normalizedPath.substring(basePath.length) || '/' : normalizedPath;
    }
  } else {
    // For wildcard patterns like /target/*
    if (config.pattern.endsWith('*')) {
      const basePath = config.pattern.slice(0, -1); // Remove the wildcard

      // If path exactly matches the base path (with or without trailing slash)
      if (normalizedPath === basePath || normalizedPath === basePath.slice(0, -1)) {
        return '/';
      }

      // Normal case: extract the part after the base path
      if (normalizedPath.startsWith(basePath)) {
        const relativePath = normalizedPath.substring(basePath.length);
        // Ensure the relative path starts with a slash
        return relativePath.startsWith('/') ? relativePath : '/' + relativePath;
      }
    }
  }

  // For exact match patterns, return '/'
  return '/';
}
