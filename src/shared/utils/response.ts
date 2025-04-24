// Security headers applied to all responses for better protection
const DEFAULT_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
};

// Default CORS headers
const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Admin-API-Key',
  'Access-Control-Max-Age': '86400', // 1 day
};

// Generic error messages for production for better security
const PRODUCTION_ERROR_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * Create a standardized error response with security headers and optional CORS
 */
export function errorResponse(
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
  request?: Request,
  env?: Env
): Response {
  const responseMessage = message || PRODUCTION_ERROR_MESSAGES[status];
  const headers = getResponseHeaders(extraHeaders, request, env);
  return Response.json({ error: responseMessage, code: status }, { status, headers });
}

/**
 * Create a standardized success response with security headers and optional CORS
 */
export function successResponse<T>(
  data: T,
  status: number = 200,
  extraHeaders: Record<string, string> = {},
  request?: Request,
  env?: Env
): Response {
  const headers = getResponseHeaders(extraHeaders, request, env);
  return Response.json(data, { status, headers });
}

/**
 * Create a standardized response from an existing Response with security headers and CORS
 */
export function secureResponse(response: Response, request?: Request, env?: Env): Response {
  const headers = getResponseHeaders({}, request, env);

  // Add response headers (preserving security headers if there's a conflict)
  response.headers.forEach((value, key) => {
    // Skip if it's a security header we want to enforce
    if (!(key in DEFAULT_SECURITY_HEADERS)) {
      headers[key] = value;
    }
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(request: Request, env?: Env): Response {
  const headers = getResponseHeaders({}, request, env);
  return new Response(null, { status: 204, headers });
}

/**
 * Get all response headers including security, CORS, and any extra headers
 */
function getResponseHeaders(extraHeaders: Record<string, string> = {}, request?: Request, env?: Env): Record<string, string> {
  const headers: Record<string, string> = { ...DEFAULT_SECURITY_HEADERS, ...extraHeaders };

  // Skip work if no request or env
  if (!request || !env) {
    return headers;
  }

  const origin = request.headers.get('Origin');

  if (origin) {
    // Get allowed origins list
    const allowedOrigins =
      env?.ALLOWED_ORIGINS?.split(',')
        .map((o) => o.trim())
        .filter(Boolean) || [];

    // Determine if origin is allowed
    const isAllowed = allowedOrigins.length > 0 ? allowedOrigins.includes(origin) : origin.startsWith('https://');

    headers['Access-Control-Allow-Origin'] = isAllowed ? origin : 'null';
    Object.assign(headers, DEFAULT_CORS_HEADERS);
  }

  return headers;
}
