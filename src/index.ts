// APIKI Gateway - Cloudflare Worker for simple API Key Validation and Credit Management

import type { Env, ExportedHandler } from './types';
import { validateApiKey } from './services/apiKey';
import { getClient } from './services/clients';
import { getEndpointCost, processCredits } from './services/credits';
import { forwardRequestToBackend } from './handlers/proxy';
import { handleAdminRequest } from './handlers/admin';
import { errorResponse, handleCors } from './utils/response';
import { logDebug } from './utils/logging';

async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;
	const requestId = crypto.randomUUID().slice(0, 8); // Short ID for tracking
	const method = request.method;

	try {
		// Skip OPTIONS requests (CORS preflight) early
		if (method === 'OPTIONS') {
			return handleCors(request, env);
		}

		// Minimal logging to avoid performance impact
		logDebug('request', `${method} ${path} (${requestId})`);

		// Handle admin endpoints
		if (path.startsWith('/admin/')) {
			return handleAdminRequest(request, env);
		}

		// Get API key from header
		const apiKey = request.headers.get('X-API-Key');
		if (!apiKey) {
			return errorResponse(401, 'API key required');
		}

		// Validate API key
		const keyData = await validateApiKey(apiKey, env);
		if (!keyData) {
			return errorResponse(403, 'Invalid API key');
		}

		// Get client data
		const clientId = keyData.clientId;
		const client = await getClient(clientId, env);
		if (!client) {
			return errorResponse(403, 'Client not found');
		}

		// Determine endpoint cost
		const endpoint = path;
		const cost = getEndpointCost(endpoint);

		// Process credits
		const creditResult = await processCredits(clientId, cost, env);
		if (!creditResult.success) {
			return errorResponse(429, 'Insufficient credits', {
				'X-Credits-Remaining': creditResult.remaining.toString(),
				'X-Credits-Required': cost.toString(),
			});
		}

		// Forward the request
		return await forwardRequestToBackend(request, client, creditResult, env, requestId);
	} catch (error) {
		// Log the error with more detail
		console.error(`APIKI Gateway error (${requestId}):`, error);

		// Return a generic error to the client
		return errorResponse(500, 'Gateway error', {
			'X-Request-ID': requestId, // Include request ID for tracing
		});
	}
}

// Export the handler for Cloudflare Workers
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return handleRequest(request, env);
	},
} satisfies ExportedHandler<Env>;
