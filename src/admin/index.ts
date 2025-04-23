// APIKI Admin - Cloudflare Worker for admin operations

import { logDebug } from '@/shared/utils/logging';
import { errorResponse, handleCors } from '@/shared/utils/response';

import { handleApiKeyRequest } from './handlers/apiKey';
import { handleCreditRequest } from './handlers/credits';

// Common headers for admin responses
const ADMIN_DEFAULT_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};

/**
 * Main entry point for the Admin API Worker
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8); // Short ID for tracking

    const adminAuthKey = env.ADMIN_AUTH_KEY;
    if (!adminAuthKey) {
      return errorResponse(401, 'Admin API key not configured', { 'X-Request-ID': requestId }, request, env);
    }

    try {
      // Skip CORS preflight requests
      if (request.method === 'OPTIONS') {
        return handleCors(request, env);
      }

      // Get Admin API key from header
      const adminApiKey = request.headers.get('X-Admin-API-Key');
      if (!adminApiKey) {
        return errorResponse(401, 'Admin API key required', { 'X-Request-ID': requestId }, request, env);
      }

      // Validate Admin API key
      if (adminApiKey !== adminAuthKey) {
        return errorResponse(401, 'Invalid Admin API key', { 'X-Request-ID': requestId }, request, env);
      }

      // Log the admin request
      logDebug('admin:main', `${request.method} ${request.url}`, { requestId, origin: request.headers.get('Origin') });

      // Route to the appropriate handler based on path
      const url = new URL(request.url);
      const path = url.pathname;

      if (path.startsWith('/admin/api-keys')) {
        return handleApiKeyRequest(request, env);
      } else if (path.startsWith('/admin/credits')) {
        return handleCreditRequest(request, env);
      }

      // If no specific handler matches, return 404
      return errorResponse(
        404,
        'Not Found',
        {
          ...ADMIN_DEFAULT_HEADERS,
          'X-Request-ID': requestId,
        },
        request,
        env
      );
    } catch (error: unknown) {
      console.error(`Unhandled admin error (${requestId}):`, error instanceof Error ? error.message : String(error));
      return errorResponse(
        500,
        'Internal Server Error',
        {
          ...ADMIN_DEFAULT_HEADERS,
          'X-Request-ID': requestId,
        },
        request,
        env
      );
    }
  },
} as ExportedHandler<Env>;
