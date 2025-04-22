// APIKI Gateway - Cloudflare Worker for simple API Key Validation and Credit Management

import { logDebug } from '@/shared/utils/logging';
import { errorResponse, handleCors, secureResponse } from '@/shared/utils/response';

import { validateApiKey } from './services/apiKey';
import { getClient } from './services/clients';
import { getRequestCost, processCredits } from './services/credits';
import { findTargetConfig } from './services/target';

/**
 * Main entry point for the API Gateway Worker
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID().slice(0, 8); // Short ID for tracking

    try {
      // Skip CORS preflight requests
      if (request.method === 'OPTIONS') {
        return handleCors(request, env);
      }

      // Get API key from header
      const apiKey = request.headers.get('X-API-Key');
      if (!apiKey) {
        return errorResponse(401, 'API key required', { 'X-Request-ID': requestId }, request, env);
      }

      // Validate API key
      const keyData = await validateApiKey(apiKey, env);
      if (!keyData) {
        return errorResponse(403, 'Invalid API key', { 'X-Request-ID': requestId }, request, env);
      }

      // Get client data
      const clientId = keyData.clientId;
      const client = await getClient(clientId, env);
      if (!client) {
        return errorResponse(403, 'Client not found', { 'X-Request-ID': requestId }, request, env);
      }

      // Determine request cost
      const url = new URL(request.url);
      const path = url.pathname;
      const requestCost = getRequestCost(path);

      // Process credits and check if the request is allowed
      const creditResult = await processCredits(clientId, requestCost, env);
      if (!creditResult.success) {
        return errorResponse(
          429,
          'Insufficient credits',
          {
            'X-Credits-Remaining': creditResult.remaining.toString(),
            'X-Credits-Required': requestCost.toString(),
            'X-Request-ID': requestId,
          },
          request,
          env
        );
      }

      // Find the appropriate target for this request
      const targetConfig = await findTargetConfig(path, env);

      if (!targetConfig) {
        logDebug('gateway', `No target found for path: ${path}`);
        return errorResponse(404, 'No target found for this path', { 'X-Request-ID': requestId }, request, env);
      }

      // Build the target URL
      const targetUrl = new URL(path, targetConfig.targetUrl);

      // Copy query parameters
      url.searchParams.forEach((value, key) => {
        targetUrl.searchParams.append(key, value);
      });

      // Create new request to the target
      const headers = new Headers(request.headers);

      // Add custom headers if configured
      if (targetConfig.customHeaders) {
        Object.entries(targetConfig.customHeaders).forEach(([key, value]) => {
          headers.set(key, value);
        });
      }

      // Add credits header if configured
      if (targetConfig.addCreditsHeader) {
        headers.set('X-Credits-Remaining', creditResult.remaining.toString());
      }

      // Optionally forward the API key
      if (!targetConfig.forwardApiKey) {
        headers.delete('X-API-Key');
      }

      // Create the fetch request
      const fetchRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: headers,
        body: request.body,
      });

      logDebug('gateway:proxy', `Proxying request to: ${targetUrl.toString()}`, { requestId, origin: request.headers.get('Origin') });

      // Forward the request to the target
      const targetResponse = await fetch(fetchRequest);

      // Clone the response to modify it
      const responseHeaders = new Headers(targetResponse.headers);

      // Add gateway headers
      responseHeaders.set('X-Api-Gateway', 'true');
      responseHeaders.set('X-Request-ID', requestId);

      // Return the response with security headers
      return secureResponse(
        new Response(targetResponse.body, {
          status: targetResponse.status,
          statusText: targetResponse.statusText,
          headers: responseHeaders,
        }),
        request,
        env
      );
    } catch (error: unknown) {
      console.error(`Gateway error (${requestId}):`, error instanceof Error ? error.message : String(error));
      return errorResponse(500, 'Internal Server Error', { 'X-Request-ID': requestId }, request, env);
    }
  },
} as ExportedHandler<Env>;
