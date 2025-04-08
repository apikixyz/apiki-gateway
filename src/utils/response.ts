// Consistent error response formatting
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
export function handleCors(request: Request): Response {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*', // TODO: Add origin check
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
			'Access-Control-Max-Age': '86400',
			// Add security headers
			'X-Content-Type-Options': 'nosniff',
		},
	});
}
