/**
 * Shared authentication utilities
 */
import { logDebug } from './logging';

// Cache auth results for 5 minutes
const AUTH_CACHE_TTL = 300000;
const authCache = new Map<string, { valid: boolean; expires: number }>();

interface AuthResult {
  valid: boolean;
  message?: string;
}

/**
 * Validate admin authentication
 * Supports two methods:
 * 1. Authorization header with Bearer token
 * 2. X-Admin-Key header with admin key
 */
export function validateAdminAuth(request: Request, env: Env): AuthResult {
  try {
    // Check for Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      return validateAdminToken(token, env);
    }

    // Check for X-Admin-Key header
    const adminKey = request.headers.get('X-Admin-Key');
    if (adminKey) {
      return validateAdminKey(adminKey, env);
    }

    // No auth provided
    return { valid: false, message: 'Authentication required' };
  } catch (error) {
    logDebug('auth', 'Auth validation error', { error });
    return { valid: false, message: 'Authentication error' };
  }
}

/**
 * Validate an admin token with caching for performance
 */
function validateAdminToken(token: string, env: Env): AuthResult {
  // Check cache first
  const cacheKey = `token:${token}`;
  const now = Date.now();
  const cached = authCache.get(cacheKey);

  if (cached && cached.expires > now) {
    return { valid: cached.valid };
  }

  // Simple token validation against environment variable
  const adminAuthKey = env.ADMIN_AUTH_KEY;
  if (!adminAuthKey) {
    logDebug('auth', 'Admin auth key not configured');
    return { valid: false, message: 'Authentication not configured' };
  }

  const isValid = token === adminAuthKey;

  // Cache the result
  authCache.set(cacheKey, {
    valid: isValid,
    expires: now + AUTH_CACHE_TTL,
  });

  return {
    valid: isValid,
    message: isValid ? undefined : 'Invalid token',
  };
}

/**
 * Validate an admin key with caching for performance
 */
function validateAdminKey(key: string, env: Env): AuthResult {
  // Check cache first
  const cacheKey = `adminkey:${key}`;
  const now = Date.now();
  const cached = authCache.get(cacheKey);

  if (cached && cached.expires > now) {
    return { valid: cached.valid };
  }

  // Simple key validation against environment variable
  const adminAuthKey = env.ADMIN_AUTH_KEY;
  if (!adminAuthKey) {
    logDebug('auth', 'Admin auth key not configured');
    return { valid: false, message: 'Authentication not configured' };
  }

  const isValid = key === adminAuthKey;

  // Cache the result
  authCache.set(cacheKey, {
    valid: isValid,
    expires: now + AUTH_CACHE_TTL,
  });

  return {
    valid: isValid,
    message: isValid ? undefined : 'Invalid admin key',
  };
}
