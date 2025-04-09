import { ClientData, CreditResult, Env } from '../types';
import { findBackendConfig } from '../services/backends';
import { logDebug } from '../utils/logging';
import { errorResponse } from '../utils/response';

export async function forwardRequestToBackend(
	request: Request,
	client: ClientData,
	creditResult: CreditResult,
	env: Env,
	requestId: string
): Promise<Response> {
	// Get the path to match against backend configs
	const url = new URL(request.url);
	const path = url.pathname;

	// Find the appropriate backend configuration
	const backendConfig = await findBackendConfig(path, env);

	// Create a new headers object based on the original request
	const headers = new Headers();

	// Only forward safe headers to prevent leaking information
	const safeHeaders = ['content-type', 'content-length', 'accept', 'accept-language', 'user-agent'];

	for (const header of safeHeaders) {
		const value = request.headers.get(header);
		if (value) {
			headers.set(header, value);
		}
	}

	// Add standard client headers
	headers.set('X-Apiki-Client-Id', client.id);
	headers.set('X-Apiki-Client-Type', client.type);
	headers.set('X-Apiki-Plan', client.plan);
	headers.set('X-Request-ID', requestId);

	// Add credit information headers if configured
	if (!backendConfig || backendConfig.addCreditsHeader) {
		headers.set('X-Apiki-Credits-Remaining', creditResult.remaining.toString());
		if (creditResult.used) {
			headers.set('X-Apiki-Credits-Used', creditResult.used.toString());
		}
	}

	// Add API key if configured to forward it
	if (backendConfig?.forwardApiKey) {
		const apiKey = request.headers.get('X-API-Key');
		if (apiKey) {
			headers.set('X-API-Key', apiKey);
		}
	}

	// Add any custom headers from the backend configuration
	if (backendConfig?.customHeaders) {
		for (const [name, value] of Object.entries(backendConfig.customHeaders)) {
			headers.set(name, value);
		}
	}

	// Create the backend URL
	let backendUrl: URL;
	let targetPath = path;

	if (backendConfig) {
		// Use the configured backend URL
		backendUrl = new URL(backendConfig.targetUrl);

		// Handle wildcard pattern for forwarding only the wildcard part
		if (!backendConfig.isRegex && backendConfig.pattern.endsWith('*')) {
			const prefix = backendConfig.pattern.slice(0, -1); // Pattern without the '*'

			if (path.startsWith(prefix)) {
				// Extract the part after the prefix
				targetPath = path.substring(prefix.length);

				// Ensure the target path starts with a slash if not empty
				if (targetPath !== '' && !targetPath.startsWith('/')) {
					targetPath = '/' + targetPath;
				}
			}
		}

		// Set the path and query for the backend URL
		backendUrl.pathname = targetPath;
		backendUrl.search = url.search;
	} else {
		// Fallback to default behavior if no configuration found
		backendUrl = new URL(request.url);
		backendUrl.hostname = 'your-backend-api.example.com';
	}

	// Create a new request with the filtered headers, same method, and body
	const backendRequest = new Request(backendUrl.toString(), {
		method: request.method,
		headers: headers,
		body: request.body,
		redirect: 'follow',
	});

	try {
		// Send request to backend and track response time
		const startTime = Date.now();
		const response = await fetch(backendRequest);
		const responseTime = Date.now() - startTime;

		logDebug('backend', `Response from ${backendUrl.hostname} (${response.status}): ${responseTime}ms`);

		// Clone the response and add our headers
		const newResponse = new Response(response.body, response);
		newResponse.headers.set('X-Request-ID', requestId);

		// Add credits information to the response if configured
		if (!backendConfig || backendConfig.addCreditsHeader) {
			newResponse.headers.set('X-Apiki-Credits-Remaining', creditResult.remaining.toString());
		}

		return newResponse;
	} catch (error) {
		console.error(`Backend request failed: ${error}`);

		// Return a gateway error
		return errorResponse(502, 'Backend request failed', {
			'X-Request-ID': requestId,
		});
	}
}
