// APIKI Admin - Cloudflare Worker for admin operations

import { Env, ExportedHandler } from '../shared/types';
import { handleAdminRequest } from './handlers/request';
import { logDebug } from '../shared/utils/logging';

/**
 * Main entry point for the Admin Worker
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Log request for debugging
      logDebug('admin:main', `${request.method} ${path}`, { origin: request.headers.get('Origin') });

      // Handle all admin requests
      return await handleAdminRequest(request, env);
    } catch (error: unknown) {
      console.error('Unhandled admin error:', error instanceof Error ? error.message : String(error));
      return new Response('Internal Server Error', { status: 500 });
    }
  }
} as ExportedHandler<Env>;
