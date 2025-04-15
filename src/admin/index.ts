// APIKI Admin - Cloudflare Worker for admin operations

import { logDebug } from '@/shared/utils/logging';
import { errorResponse, addSecurityHeaders } from '@/shared/utils/response';

import { handleAdminRequest } from './handlers/request';

/**
 * Main entry point for the Admin Worker
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8); // Short ID for tracking

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Log request for debugging
      logDebug('admin:main', `${request.method} ${path}`, { origin: request.headers.get('Origin') });

      // Handle all admin requests
      return await handleAdminRequest(request, env);
    } catch (error: unknown) {
      console.error(`Unhandled admin error (${requestId}):`, error instanceof Error ? error.message : String(error));
      return addSecurityHeaders(errorResponse(500, 'Internal Server Error', { 'X-Request-ID': requestId }), request, env);
    }
  },
} as ExportedHandler<Env>;
