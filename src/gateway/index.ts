// APIKI Gateway - Cloudflare Worker for simple API Key Validation and Usage Credit Management

import { logDebug } from '@/shared/utils/logging';
import { errorResponse, handleCors, secureResponse } from '@/shared/utils/response';

import { getApiKeyConfig } from './services/apiKey';
import { processCredits } from './services/credits';
import { getTargetConfig, matchTargetPattern } from './services/target';

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

      // Validate API key and get the config
      const apiKeyConfig = await getApiKeyConfig(apiKey, env);
      if (!apiKeyConfig || !apiKeyConfig.clientId || !apiKeyConfig.targetId) {
        return errorResponse(403, 'Invalid API key', { 'X-Request-ID': requestId }, request, env);
      }

      // Check if the API key is active and not expired
      if (!apiKeyConfig.active || (apiKeyConfig.expiresAt && apiKeyConfig.expiresAt < Date.now())) {
        return errorResponse(403, 'API key expired or inactive', { 'X-Request-ID': requestId }, request, env);
      }

      // Get the target config by API key
      const targetConfig = getTargetConfig(apiKeyConfig.targetId);
      if (!targetConfig) {
        return errorResponse(404, 'Target not found for this API key', { 'X-Request-ID': requestId }, request, env);
      }

      // Check if the path matches the target pattern
      const url = new URL(request.url);
      const path = url.pathname;
      if (!matchTargetPattern(path, targetConfig)) {
        return errorResponse(404, 'Target not found for this path', { 'X-Request-ID': requestId }, request, env);
      }

      // Check if the client has enough credits to process the request
      const creditResult = await processCredits(targetConfig, apiKeyConfig.clientId, env);

      // If not enough credits, return a 402 (Payment Required) error
      if (!creditResult.success) {
        return errorResponse(
          402,
          'Insufficient credits',
          {
            'X-Credits-Remaining': creditResult.remaining.toString(),
            'X-Credits-Required': targetConfig.costInfo.cost.toString(),
            'X-Request-ID': requestId,
          },
          request,
          env
        );
      }

      // Build the target URL
      const targetUrl = new URL(path, targetConfig.targetUrl);

      // Copy query parameters
      url.searchParams.forEach((value, key) => {
        targetUrl.searchParams.append(key, value);
      });

      // Create the fetch request with the target URL and the original request
      const fetchRequest = new Request(targetUrl, request);

      logDebug('gateway', `Proxying request: ${request.method} ${targetUrl.toString()}`, {
        requestId,
        origin: request.headers.get('Origin'),
      });

      // Forward the request to the target
      const targetResponse = await fetch(fetchRequest);

      // Clone the response headers to modify them
      const responseHeaders = new Headers(targetResponse.headers);

      // Add gateway headers
      responseHeaders.set('X-Credits-Remaining', creditResult.remaining.toString());
      responseHeaders.set('X-Credits-Used', creditResult.used.toString());
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
