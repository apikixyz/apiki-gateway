// Consistent error response formatting
import { Env } from '../types';

export function errorResponse(status: number, message: string, extraHeaders: Record<string, string> = {}): Response {
	// Generic error messages for production
	const productionMessages: Record<number, string> = {
		400: 'Bad Request',
		401: 'Unauthorized',
		403: 'Forbidden',
		404: 'Not Found',
		429: 'Too Many Requests',
		500: 'Internal Server Error',
		502: 'Bad Gateway',
		503: 'Service Unavailable',
	};

	// Use more generic messages in production for better security
	const responseMessage = productionMessages[status] || message;

	const headers = {
		'Content-Type': 'application/json',
		// Add security headers
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		...extraHeaders,
	};

	// Include specific error code for debugging while keeping messages generic
	return new Response(
		JSON.stringify({
			error: responseMessage,
			code: status,
		}),
		{ status, headers }
	);
}

// CORS response handler
export function handleCors(request: Request, env?: Env): Response {
	const origin = request.headers.get('Origin');

	// If no origin provided, use safe default
	if (!origin) {
		return createCorsResponse('null');
	}

	// Get allowed origins from environment variable
	const allowedOrigins = env?.ALLOWED_ORIGINS?.split(',') || [];

	// For development, if no allowed origins configured, fallback to a safer approach than '*'
	if (allowedOrigins.length === 0) {
		// Only allow the requesting origin if it's a secure connection
		const responseOrigin = origin.startsWith('https://') ? origin : 'null';
		return createCorsResponse(responseOrigin);
	}

	// For production environments, strictly validate against configured domains
	const responseOrigin = allowedOrigins.includes(origin) ? origin : 'null';

	return createCorsResponse(responseOrigin);
}

function createCorsResponse(origin: string): Response {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
			'Access-Control-Max-Age': '86400',
			'X-Content-Type-Options': 'nosniff',
		},
	});
}
