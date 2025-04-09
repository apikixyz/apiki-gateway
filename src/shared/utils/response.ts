// Consistent error response formatting
import { Env } from '../types';
import { generateNonce } from './crypto';

// Security headers applied to all responses for better protection
const DEFAULT_SECURITY_HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Content-Security-Policy': "default-src 'self'; script-src 'self'",
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
	'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
	'Pragma': 'no-cache'
};

/**
 * Create a standardized error response
 */
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
		...DEFAULT_SECURITY_HEADERS,
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

/**
 * Create a standardized success response
 */
export function successResponse<T>(
	data: T,
	status: number = 200,
	extraHeaders: Record<string, string> = {}
): Response {
	const headers = {
		'Content-Type': 'application/json',
		...DEFAULT_SECURITY_HEADERS,
		...extraHeaders,
	};

	return new Response(
		JSON.stringify({ data }),
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

	try {
		// Get allowed origins from environment variable
		const allowedOrigins = env?.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];

		// For development, if no allowed origins configured, fallback to a safer approach than '*'
		if (allowedOrigins.length === 0) {
			// Only allow the requesting origin if it's a secure connection
			const responseOrigin = origin.startsWith('https://') ? origin : 'null';
			return createCorsResponse(responseOrigin);
		}

		// For production environments, strictly validate against configured domains
		const responseOrigin = allowedOrigins.includes(origin) ? origin : 'null';

		return createCorsResponse(responseOrigin);
	} catch (error) {
		// If there's any error processing CORS, default to secure options
		console.error('Error processing CORS:', error);
		return createCorsResponse('null');
	}
}

/**
 * Add CORS and security headers to any response
 */
export function addSecurityHeaders(response: Response, request: Request, env?: Env): Response {
	const headers = new Headers(response.headers);

	// Add security headers
	Object.entries(DEFAULT_SECURITY_HEADERS).forEach(([key, value]) => {
		if (!headers.has(key)) {
			headers.set(key, value);
		}
	});

	// Add CORS headers if needed
	const origin = request.headers.get('Origin');
	if (origin) {
		const allowedOrigins = env?.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
		const allowOrigin = allowedOrigins.includes(origin) ? origin : 'null';
		headers.set('Access-Control-Allow-Origin', allowOrigin);
		headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization, X-Admin-Key');
		headers.set('Access-Control-Max-Age', '86400');
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

/**
 * Create a CORS preflight response
 */
function createCorsResponse(origin: string): Response {
	const nonce = generateNonce();

	return new Response(null, {
		status: 204,
		headers: {
			...DEFAULT_SECURITY_HEADERS,
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization, X-Admin-Key',
			'Access-Control-Max-Age': '86400',
			'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'`,
		},
	});
}
