// APIKI Gateway - Cloudflare Worker for simple API Key Validation and Credit Management

// Define data interfaces
interface ApiKeyData {
	userId: string;
	active: boolean;
	createdAt: string;
	expiresAt: string | null;
	restrictions: Record<string, any>;
}

interface UserData {
	id: string;
	createdAt: string;
	plan: string;
	name: string;
	email: string;
	[key: string]: any;
}

interface CreditData {
	balance: number;
	lastUpdated: string;
}

interface CreditResult {
	success: boolean;
	remaining: number;
	used?: number;
}

interface ApiKeyOptions {
	expiresAt?: string;
	restrictions?: Record<string, any>;
	name?: string;
}

interface EndpointCosts {
	[endpoint: string]: number;
}

// Define endpoint configuration interface
interface BackendConfig {
	id: string;
	pattern: string; // URL pattern to match (can be regex or simple path)
	targetUrl: string; // The target backend URL
	isRegex: boolean; // Whether pattern is a regex
	addCreditsHeader: boolean; // Whether to add the credits header
	forwardApiKey: boolean; // Whether to forward the original API key
	customHeaders?: Record<string, string>; // Custom headers to add
	createdAt: string;
	updatedAt: string;
}

// Add helper function for consistent logging
function logDebug(context: string, message: string, data?: any): void {
	const timestamp = new Date().toISOString();
	const logEntry = {
		timestamp,
		context,
		message,
		...(data && { data }),
	};
	console.log(JSON.stringify(logEntry));
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;
	const requestId = crypto.randomUUID().slice(0, 8); // Short ID for tracking

	logDebug('request', `Incoming request ${requestId}`, {
		path,
		method: request.method,
		headers: Object.fromEntries([...request.headers].map((h) => [h[0], h[1]])),
	});

	// Handle admin endpoints
	if (path.startsWith('/admin/')) {
		logDebug('request', `Admin request ${requestId}`, { path });
		return handleAdminRequest(request, env);
	}

	// Skip OPTIONS requests (CORS preflight)
	if (request.method === 'OPTIONS') {
		logDebug('request', `CORS preflight request ${requestId}`, { path });
		return handleCors(request);
	}

	// Get API key from header
	const apiKey = request.headers.get('X-API-Key');
	if (!apiKey) {
		logDebug('auth', `Missing API key ${requestId}`, { path });
		return errorResponse(401, 'API key required');
	}

	try {
		// Validate API key and get user
		logDebug('auth', `Validating API key ${requestId}`, { apiId: apiKey });
		const keyData = await validateApiKey(apiKey, env);
		if (!keyData) {
			logDebug('auth', `Invalid API key ${requestId}`, { apiId: apiKey.slice(0, 4) + '***' });
			return errorResponse(403, 'Invalid API key');
		}

		// Get user data
		const userId = keyData.userId;
		logDebug('auth', `Getting user data ${requestId}`, { userId });
		const user = await getUser(userId, env);
		if (!user) {
			logDebug('auth', `User not found ${requestId}`, { userId });
			return errorResponse(403, 'User not found');
		}

		// Determine endpoint cost
		const endpoint = url.pathname;
		const cost = getEndpointCost(endpoint);
		logDebug('credits', `Endpoint cost ${requestId}`, { endpoint, cost });

		// Check and update credits
		logDebug('credits', `Processing credits ${requestId}`, { userId, cost });
		const creditResult = await processCredits(userId, cost, env);
		if (!creditResult.success) {
			logDebug('credits', `Insufficient credits ${requestId}`, {
				remaining: creditResult.remaining,
				required: cost,
			});
			return errorResponse(429, 'Insufficient credits', {
				'X-Credits-Remaining': creditResult.remaining.toString(),
				'X-Credits-Required': cost.toString(),
			});
		}

		// Forward the request with additional headers
		logDebug('forward', `Forwarding request ${requestId}`, {
			path,
			userId: user.id,
			plan: user.plan,
			creditsRemaining: creditResult.remaining,
		});
		return await forwardRequestToBackend(request, user, creditResult, env, requestId);
	} catch (error) {
		logDebug('error', `Gateway error ${requestId}`, { error: String(error) });
		console.error('Apiki gateway error:', error);
		return errorResponse(500, 'Gateway error');
	}
}

// ADMIN REQUEST HANDLER

async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
	// Check admin authentication
	const adminKey = request.headers.get('X-Admin-Key');
	if (!adminKey || adminKey !== env.ADMIN_AUTH_KEY) {
		return errorResponse(403, 'Invalid admin credentials');
	}

	const url = new URL(request.url);
	const path = url.pathname;

	try {
		// Handle different admin endpoints
		switch (path) {
			case '/admin/users':
				return handleAdminUsers(request, env);
			case '/admin/apikeys':
				return handleAdminApiKeys(request, env);
			case '/admin/credits':
				return handleAdminCredits(request, env);
			case '/admin/backends':
				return handleAdminBackends(request, env);
			default:
				return errorResponse(404, 'Admin endpoint not found');
		}
	} catch (error) {
		console.error('Admin endpoint error:', error);
		return errorResponse(500, 'Admin endpoint error');
	}
}

async function handleAdminUsers(request: Request, env: Env): Promise<Response> {
	// Only allow POST for user creation
	if (request.method !== 'POST') {
		return errorResponse(405, 'Method not allowed');
	}

	try {
		// Parse JSON body
		const userData = (await request.json()) as CreateUserData;

		// Validate required fields
		if (!userData.name || !userData.email) {
			return errorResponse(400, 'Name and email are required');
		}

		// Check if email is already registered
		if (await isEmailRegistered(userData.email, env)) {
			return errorResponse(409, 'Email address is already registered');
		}

		// Create the user
		const result = await createUser(userData, env);

		return new Response(
			JSON.stringify({
				success: true,
				userId: result.userId,
			}),
			{
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	} catch (error) {
		return errorResponse(400, 'Invalid request data');
	}
}

async function handleAdminApiKeys(request: Request, env: Env): Promise<Response> {
	// Handle different methods
	switch (request.method) {
		case 'POST':
			try {
				// Parse JSON body
				const data = (await request.json()) as { userId: string; options?: ApiKeyOptions };

				// Validate required fields
				if (!data.userId) {
					return errorResponse(400, 'User ID is required');
				}

				// Check if user exists
				const user = await getUser(data.userId, env);
				if (!user) {
					return errorResponse(404, 'User not found');
				}

				// Create API key
				const result = await createApiKey(data.userId, data.options || {}, env);

				return new Response(
					JSON.stringify({
						success: true,
						...result,
					}),
					{
						status: 201,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			} catch (error) {
				return errorResponse(400, 'Invalid request data');
			}

		case 'DELETE':
			try {
				// Parse JSON body or URL parameters
				const apiKey = new URL(request.url).searchParams.get('key');
				if (!apiKey) {
					return errorResponse(400, 'API key is required');
				}

				// Deactivate key instead of deleting
				await deactivateApiKey(apiKey, env);

				return new Response(
					JSON.stringify({
						success: true,
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			} catch (error) {
				return errorResponse(400, 'Invalid request data');
			}

		default:
			return errorResponse(405, 'Method not allowed');
	}
}

async function handleAdminCredits(request: Request, env: Env): Promise<Response> {
	// Only allow POST for adding credits
	if (request.method !== 'POST') {
		return errorResponse(405, 'Method not allowed');
	}

	try {
		// Parse JSON body
		const data = (await request.json()) as { userId: string; amount: number };

		// Validate required fields
		if (!data.userId) {
			return errorResponse(400, 'User ID is required');
		}

		// Validate amount
		if (typeof data.amount !== 'number' || data.amount <= 0) {
			return errorResponse(400, 'Amount must be a positive number');
		}

		// Check if user exists
		const user = await getUser(data.userId, env);
		if (!user) {
			return errorResponse(404, 'User not found');
		}

		// Add credits
		const result = await addCredits(data.userId, data.amount, env);

		return new Response(
			JSON.stringify({
				success: true,
				balance: result.balance,
			}),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	} catch (error) {
		return errorResponse(400, 'Invalid request data');
	}
}

// Add a function to deactivate API keys (instead of deleting them)
async function deactivateApiKey(apiKey: string, env: Env): Promise<boolean> {
	// Get API key data
	const keyData = (await env.APIKI_KV.get(`apikey:${apiKey}`, { type: 'json' })) as ApiKeyData | null;
	if (!keyData) return false;

	// Update to inactive
	keyData.active = false;

	// Save updated key data
	await env.APIKI_KV.put(`apikey:${apiKey}`, JSON.stringify(keyData));

	return true;
}

// VALIDATION FUNCTIONS

async function validateApiKey(apiKey: string, env: Env): Promise<ApiKeyData | null> {
	// Get API key data from KV
	logDebug('validateApiKey', `Getting API key data`, { apiKey });
	const keyData = (await env.APIKI_KV.get(`apikey:${apiKey}`, { type: 'json' })) as ApiKeyData | null;
	if (!keyData) return null;

	// Check if key is active
	if (!keyData.active) return null;

	// Check if key has expired
	if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
		return null;
	}

	// Track API key usage
	await trackApiKeyUsage(apiKey, env);

	return keyData;
}

async function getUser(userId: string, env: Env): Promise<UserData | null> {
	// Get user data from KV
	return (await env.APIKI_KV.get(`user:${userId}`, { type: 'json' })) as UserData | null;
}

// CREDIT FUNCTIONS

async function processCredits(userId: string, cost: number, env: Env): Promise<CreditResult> {
	// Get current credit balance
	const creditsKey = `credits:${userId}`;
	const creditData = ((await env.APIKI_KV.get(creditsKey, { type: 'json' })) as CreditData) || {
		balance: 0,
		lastUpdated: new Date().toISOString(),
	};

	// Check if enough credits
	if (creditData.balance < cost) {
		return {
			success: false,
			remaining: creditData.balance,
		};
	}

	// Deduct credits
	const newBalance = creditData.balance - cost;

	// Update credit balance
	await env.APIKI_KV.put(
		creditsKey,
		JSON.stringify({
			balance: newBalance,
			lastUpdated: new Date().toISOString(),
		})
	);

	// Track usage
	await trackUsage(userId, cost, env);

	return {
		success: true,
		remaining: newBalance,
		used: cost,
	};
}

async function trackUsage(userId: string, amount: number, env: Env): Promise<void> {
	// Create usage key with today's date
	const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
	const usageKey = `usage:${userId}:${today}`;

	// Get current usage
	const currentUsage = parseInt((await env.APIKI_KV.get(usageKey)) || '0');

	// Update usage
	await env.APIKI_KV.put(usageKey, (currentUsage + amount).toString(), {
		// Store daily usage for 90 days
		expirationTtl: 90 * 24 * 60 * 60,
	});
}

async function trackApiKeyUsage(apiKey: string, env: Env): Promise<void> {
	// Track usage for analytics
	const today = new Date().toISOString().split('T')[0];
	const keyUsageKey = `keyusage:${apiKey}:${today}`;

	// Increment counter
	const currentCount = parseInt((await env.APIKI_KV.get(keyUsageKey)) || '0');
	await env.APIKI_KV.put(keyUsageKey, (currentCount + 1).toString(), {
		// Store daily usage for 90 days
		expirationTtl: 90 * 24 * 60 * 60,
	});
}

// UTILITY FUNCTIONS

function getEndpointCost(endpoint: string): number {
	// Define costs for different endpoints
	const costs: EndpointCosts = {
		'/api/v1/simple': 1,
		'/api/v1/search': 2,
		'/api/v1/complex': 5,
		// Add more endpoint costs as needed
	};

	// Return cost for endpoint or default cost
	return costs[endpoint] || 1;
}

// Add a function to check if a request path matches a backend pattern
function matchBackendPattern(path: string, config: BackendConfig): boolean {
	if (config.isRegex) {
		try {
			const regex = new RegExp(config.pattern);
			return regex.test(path);
		} catch (error) {
			console.error('Invalid regex pattern:', error);
			return false;
		}
	} else {
		// Simple path matching (supports wildcards at the end)
		if (config.pattern.endsWith('*')) {
			const prefix = config.pattern.slice(0, -1);
			return path.startsWith(prefix);
		}
		return path === config.pattern;
	}
}

// Function to find the appropriate backend config for a request
async function findBackendConfig(path: string, env: Env): Promise<BackendConfig | null> {
	// Get all backend configs
	const backendsList = (await env.APIKI_KV.get('backends:list', { type: 'json' })) as string[] | null;
	if (!backendsList || backendsList.length === 0) {
		logDebug('backend', 'No backend configurations found');
		return null;
	}

	logDebug('backend', `Searching for backend match`, {
		path,
		backendCount: backendsList.length,
	});

	// Try to find a matching backend
	for (const backendId of backendsList) {
		const config = (await env.APIKI_KV.get(`backend:${backendId}`, { type: 'json' })) as BackendConfig | null;
		if (config) {
			const isMatch = matchBackendPattern(path, config);
			logDebug('backend', `Testing backend pattern`, {
				backendId: config.id,
				pattern: config.pattern,
				isMatch,
			});

			if (isMatch) {
				return config;
			}
		}
	}

	return null;
}

// Update the forwardRequestToBackend function to use backend configuration
async function forwardRequestToBackend(
	request: Request,
	user: UserData,
	creditResult: CreditResult,
	env: Env,
	requestId: string
): Promise<Response> {
	// Get the path to match against backend configs
	const url = new URL(request.url);
	const path = url.pathname;

	// Find the appropriate backend configuration
	logDebug('backend', `Finding backend config ${requestId}`, { path });
	const backendConfig = await findBackendConfig(path, env);

	if (backendConfig) {
		logDebug('backend', `Found backend config ${requestId}`, {
			backendId: backendConfig.id,
			pattern: backendConfig.pattern,
			targetUrl: backendConfig.targetUrl.replace(/\/\/([^\/]+)/, '//***'), // Hide domain for security
		});
	} else {
		logDebug('backend', `No backend config found ${requestId}`, { path });
	}

	// Clone the request
	const newRequest = new Request(request);

	// Add standard user headers
	newRequest.headers.set('X-Apiki-User-Id', user.id);
	newRequest.headers.set('X-Apiki-Plan', user.plan);
	newRequest.headers.set('X-Request-ID', requestId);

	// Add credit information headers if configured
	if (!backendConfig || backendConfig.addCreditsHeader) {
		newRequest.headers.set('X-Apiki-Credits-Remaining', creditResult.remaining.toString());
		newRequest.headers.set('X-Apiki-Credits-Used', (creditResult.used || 0).toString());
	}

	// Add any custom headers from the backend configuration
	if (backendConfig?.customHeaders) {
		logDebug('backend', `Adding custom headers ${requestId}`, {
			headers: backendConfig.customHeaders,
		});
		for (const [name, value] of Object.entries(backendConfig.customHeaders)) {
			newRequest.headers.set(name, value);
		}
	}

	// Remove API key if not configured to forward it
	if (!backendConfig?.forwardApiKey) {
		logDebug('backend', `Removing API key header ${requestId}`);
		newRequest.headers.delete('X-API-Key');
	}

	// Create the backend URL
	let backendUrl: URL;

	if (backendConfig) {
		// Use the configured backend URL
		backendUrl = new URL(backendConfig.targetUrl);

		// Preserve the path and query from the original request
		backendUrl.pathname = url.pathname;
		backendUrl.search = url.search;
	} else {
		// Fallback to default behavior if no configuration found
		backendUrl = new URL(request.url);
		backendUrl.hostname = 'your-backend-api.example.com';
		logDebug('backend', `Using default backend ${requestId}`, {
			hostname: backendUrl.hostname,
		});
	}

	// Create a new request with the same method, headers, and body
	const backendRequest = new Request(backendUrl.toString(), {
		method: request.method,
		headers: newRequest.headers,
		body: request.body,
		redirect: 'follow',
	});

	logDebug('backend', `Sending request to backend ${requestId}`, {
		url: backendUrl.toString().replace(/\/\/([^\/]+)/, '//***'), // Hide domain for security
		method: backendRequest.method,
	});

	try {
		// Send request to backend
		const startTime = Date.now();
		const response = await fetch(backendRequest);
		const responseTime = Date.now() - startTime;

		logDebug('backend', `Received response from backend ${requestId}`, {
			status: response.status,
			statusText: response.statusText,
			responseTime: `${responseTime}ms`,
		});

		// Clone the response and add our headers
		const newResponse = new Response(response.body, response);
		newResponse.headers.set('X-Request-ID', requestId);

		// Add credits information to the response if configured
		if (!backendConfig || backendConfig.addCreditsHeader) {
			newResponse.headers.set('X-Apiki-Credits-Remaining', creditResult.remaining.toString());
		}

		return newResponse;
	} catch (error) {
		logDebug('error', `Backend request failed ${requestId}`, {
			error: String(error),
			url: backendUrl.toString().replace(/\/\/([^\/]+)/, '//***'),
		});

		// Return a gateway error
		return errorResponse(502, 'Backend request failed', {
			'X-Request-ID': requestId,
		});
	}
}

// Add admin endpoint to manage backend configurations
async function handleAdminBackends(request: Request, env: Env): Promise<Response> {
	// Handle different methods
	switch (request.method) {
		case 'GET':
			// List all backends or get a specific one
			const backendId = new URL(request.url).searchParams.get('id');

			if (backendId) {
				// Get a specific backend
				const config = await env.APIKI_KV.get(`backend:${backendId}`, { type: 'json' });
				if (!config) {
					return errorResponse(404, 'Backend configuration not found');
				}

				return new Response(
					JSON.stringify({
						success: true,
						backend: config,
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			} else {
				// List all backends
				const backendsList = ((await env.APIKI_KV.get('backends:list', { type: 'json' })) as string[] | null) || [];
				const backends = [];

				for (const id of backendsList) {
					const config = await env.APIKI_KV.get(`backend:${id}`, { type: 'json' });
					if (config) {
						backends.push(config);
					}
				}

				return new Response(
					JSON.stringify({
						success: true,
						backends,
					}),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			}

		case 'POST':
			// Create or update a backend configuration
			try {
				const data = (await request.json()) as Partial<BackendConfig> & { pattern: string; targetUrl: string };

				// Validate required fields
				if (!data.pattern || !data.targetUrl) {
					return errorResponse(400, 'Pattern and targetUrl are required');
				}

				// Create or update the backend
				const now = new Date().toISOString();
				const backendId = data.id || crypto.randomUUID();

				const config: BackendConfig = {
					id: backendId,
					pattern: data.pattern,
					targetUrl: data.targetUrl,
					isRegex: data.isRegex || false,
					addCreditsHeader: data.addCreditsHeader !== false, // Default to true
					forwardApiKey: data.forwardApiKey || false, // Default to false for security
					customHeaders: data.customHeaders || {},
					createdAt: data.createdAt || now,
					updatedAt: now,
				};

				// Save the configuration
				await env.APIKI_KV.put(`backend:${backendId}`, JSON.stringify(config));

				// Update the backends list
				const backendsList = ((await env.APIKI_KV.get('backends:list', { type: 'json' })) as string[] | null) || [];
				if (!backendsList.includes(backendId)) {
					backendsList.push(backendId);
					await env.APIKI_KV.put('backends:list', JSON.stringify(backendsList));
				}

				return new Response(
					JSON.stringify({
						success: true,
						backend: config,
					}),
					{
						status: data.id ? 200 : 201,
						headers: { 'Content-Type': 'application/json' },
					}
				);
			} catch (error) {
				return errorResponse(400, 'Invalid request data');
			}

		case 'DELETE':
			// Delete a backend configuration
			const idToDelete = new URL(request.url).searchParams.get('id');
			if (!idToDelete) {
				return errorResponse(400, 'Backend ID is required');
			}

			// Check if backend exists
			const configToDelete = await env.APIKI_KV.get(`backend:${idToDelete}`, { type: 'json' });
			if (!configToDelete) {
				return errorResponse(404, 'Backend configuration not found');
			}

			// Delete the configuration
			await env.APIKI_KV.delete(`backend:${idToDelete}`);

			// Update the backends list
			const currentList = ((await env.APIKI_KV.get('backends:list', { type: 'json' })) as string[] | null) || [];
			const updatedList = currentList.filter((id) => id !== idToDelete);
			await env.APIKI_KV.put('backends:list', JSON.stringify(updatedList));

			return new Response(
				JSON.stringify({
					success: true,
					message: 'Backend configuration deleted',
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);

		default:
			return errorResponse(405, 'Method not allowed');
	}
}

function errorResponse(status: number, message: string, extraHeaders: Record<string, string> = {}): Response {
	const headers = {
		'Content-Type': 'application/json',
		...extraHeaders,
	};

	return new Response(JSON.stringify({ error: message }), { status, headers });
}

function handleCors(request: Request): Response {
	// Basic CORS handling
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
			'Access-Control-Max-Age': '86400',
		},
	});
}

// ADMIN FUNCTIONS FOR API KEY MANAGEMENT
// Note: These would be called from a separate admin interface

async function createApiKey(userId: string, options: ApiKeyOptions = {}, env: Env): Promise<{ apiKey: string } & ApiKeyData> {
	// Generate a secure API key
	const buffer = new Uint8Array(16);
	crypto.getRandomValues(buffer);
	const apiKey = Array.from(buffer)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	// Create API key data
	const keyData: ApiKeyData = {
		userId,
		active: true,
		createdAt: new Date().toISOString(),
		expiresAt: options.expiresAt || null,
		restrictions: options.restrictions || {},
	};

	// Store API key
	await env.APIKI_KV.put(`apikey:${apiKey}`, JSON.stringify(keyData));

	// Link API key to user
	const userKeysKey = `keys:${userId}`;
	const userKeys = JSON.parse((await env.APIKI_KV.get(userKeysKey)) || '[]');
	userKeys.push({
		key: apiKey,
		name: options.name || 'API Key',
		createdAt: keyData.createdAt,
	});

	await env.APIKI_KV.put(userKeysKey, JSON.stringify(userKeys));

	return { apiKey, ...keyData };
}

async function addCredits(userId: string, amount: number, env: Env): Promise<{ balance: number }> {
	// Get current credits
	const creditsKey = `credits:${userId}`;
	const creditData = ((await env.APIKI_KV.get(creditsKey, { type: 'json' })) as CreditData) || {
		balance: 0,
		lastUpdated: new Date().toISOString(),
	};

	// Add credits
	const newBalance = creditData.balance + amount;

	// Update balance
	await env.APIKI_KV.put(
		creditsKey,
		JSON.stringify({
			balance: newBalance,
			lastUpdated: new Date().toISOString(),
		})
	);

	return { balance: newBalance };
}

interface CreateUserData {
	plan?: string;
	name: string;
	email: string;
	[key: string]: any;
}

async function createUser(userData: CreateUserData, env: Env): Promise<{ userId: string }> {
	const userId = crypto.randomUUID();

	// Create user - extract known properties first, then add remaining ones
	const { name, email, plan = 'free', ...otherUserData } = userData;

	// Normalize email (lowercase)
	const normalizedEmail = email.toLowerCase();

	const user: UserData = {
		id: userId,
		createdAt: new Date().toISOString(),
		plan,
		name,
		email: normalizedEmail, // Store normalized email
		...otherUserData,
	};

	// Store user data
	await env.APIKI_KV.put(`user:${userId}`, JSON.stringify(user));

	// Store email reference for uniqueness checking
	await env.APIKI_KV.put(`email:${normalizedEmail}`, userId);

	// Set initial credits based on plan
	const planCredits: Record<string, number> = {
		free: 100,
		basic: 1000,
		premium: 10000,
	};

	await env.APIKI_KV.put(
		`credits:${userId}`,
		JSON.stringify({
			balance: planCredits[plan] || 100,
			lastUpdated: new Date().toISOString(),
		})
	);

	return { userId };
}

// Add a new function to check if an email is already registered
async function isEmailRegistered(email: string, env: Env): Promise<boolean> {
	// Create a normalized version of the email (lowercase)
	const normalizedEmail = email.toLowerCase();

	// Check if email exists in the system
	const userId = await env.APIKI_KV.get(`email:${normalizedEmail}`);
	return userId !== null;
}

// Export the handler for Cloudflare Workers
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return handleRequest(request, env);
	},
} satisfies ExportedHandler<Env>;
