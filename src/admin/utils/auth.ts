import { Env } from '../../shared/types';
import { logDebug } from '../../shared/utils/logging';
import { generateHash } from './crypto';

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
 * Validate an admin token
 */
function validateAdminToken(token: string, env: Env): AuthResult {
  // Simple token validation against environment variable
  const adminAuthKey = env.ADMIN_AUTH_KEY;
  if (!adminAuthKey) {
    logDebug('auth', 'Admin auth key not configured');
    return { valid: false, message: 'Authentication not configured' };
  }

  if (token === adminAuthKey) {
    return { valid: true };
  }

  return { valid: false, message: 'Invalid token' };
}

/**
 * Validate an admin key
 */
function validateAdminKey(key: string, env: Env): AuthResult {
  // Simple key validation against environment variable
  const adminAuthKey = env.ADMIN_AUTH_KEY;
  if (!adminAuthKey) {
    logDebug('auth', 'Admin auth key not configured');
    return { valid: false, message: 'Authentication not configured' };
  }

  if (key === adminAuthKey) {
    return { valid: true };
  }

  return { valid: false, message: 'Invalid admin key' };
}
