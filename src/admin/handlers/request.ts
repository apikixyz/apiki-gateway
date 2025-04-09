import { Env } from '../../shared/types';
import { logDebug } from '../../shared/utils/logging';
import { errorResponse, successResponse, addSecurityHeaders, handleCors as corsHandler } from '../../shared/utils/response';
import { validateAdminAuth } from '../../shared/utils/auth';
import { handleApiKeyRequest } from './apiKey';
import { handleClientRequest } from './client';

// Common headers for admin responses
const ADMIN_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
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
      return corsHandler(request, env);
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
        headers
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

/**
 * Handle CORS preflight requests
 */
function handleCors(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env)
  });
}

/**
 * Add CORS headers to a response
 */
function addCorsHeaders(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = getCorsHeaders(request, env);

  corsHeaders.forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Get CORS headers based on configuration
 */
function getCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();

  // Get allowed origins from environment
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || ['*'];
  const origin = request.headers.get('Origin');

  // Set appropriate CORS headers
  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }

  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, X-Admin-Key');
  headers.set('Access-Control-Max-Age', '86400');

  return headers;
}
