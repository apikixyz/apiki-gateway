// Admin request handler

import { validateAdminAuth } from '@/shared/utils/auth';
import { logDebug } from '@/shared/utils/logging';
import { errorResponse, addSecurityHeaders, handleCors } from '@/shared/utils/response';

import { handleApiKeyRequest } from './apiKey';
import { handleClientRequest } from './client';

// Common headers for admin responses
const ADMIN_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
};

/**
 * Main handler for the Admin API requests
 */
export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const requestId = crypto.randomUUID().slice(0, 8); // Short ID for tracking

  try {
    // Skip CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCors(request, env);
    }

    // Authenticate admin request
    const authResult = validateAdminAuth(request, env);
    if (!authResult.valid) {
      return errorResponse(401, authResult.message || 'Unauthorized', {
        ...ADMIN_HEADERS,
        'X-Request-ID': requestId,
      });
    }

    // Log the admin request
    logDebug('admin', `Admin request: ${request.method} ${path}`, { requestId });

    // Route to the appropriate handler based on path
    let response: Response;

    if (path.startsWith('/admin/api-keys')) {
      response = await handleApiKeyRequest(request, env);
    } else if (path.startsWith('/admin/clients')) {
      response = await handleClientRequest(request, env);
    } else {
      // If no specific handler matches, return 404
      response = errorResponse(404, 'Not Found', {
        ...ADMIN_HEADERS,
        'X-Request-ID': requestId,
      });
    }

    // Add consistent security headers and request ID
    const headers = new Headers(response.headers);
    headers.set('X-Request-ID', requestId);

    // Return the enhanced response
    return addSecurityHeaders(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
      request,
      env
    );
  } catch (error: unknown) {
    console.error(`Admin error (${requestId}):`, error instanceof Error ? error.message : String(error));
    return errorResponse(500, 'Internal Server Error', {
      ...ADMIN_HEADERS,
      'X-Request-ID': requestId,
    });
  }
}
