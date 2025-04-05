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

async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;

	// Handle admin endpoints
	if (path.startsWith('/admin/')) {
		return handleAdminRequest(request, env);
	}

	// Skip OPTIONS requests (CORS preflight)
	if (request.method === 'OPTIONS') {
		return handleCors(request);
	}

	// Get API key from header
	const apiKey = request.headers.get('X-API-Key');
	if (!apiKey) {
		return errorResponse(401, 'API key required');
	}

	try {
		// Validate API key and get user
		const keyData = await validateApiKey(apiKey, env);
		if (!keyData) {
			return errorResponse(403, 'Invalid API key');
		}

		// Get user data
		const userId = keyData.userId;
		const user = await getUser(userId, env);
		if (!user) {
			return errorResponse(403, 'User not found');
		}

		// Determine endpoint cost
		const endpoint = url.pathname;
		const cost = getEndpointCost(endpoint);

		// Check and update credits
		const creditResult = await processCredits(userId, cost, env);
		if (!creditResult.success) {
			return errorResponse(429, 'Insufficient credits', {
				'X-Credits-Remaining': creditResult.remaining.toString(),
				'X-Credits-Required': cost.toString(),
			});
		}

		// Forward the request with additional headers
		return await forwardRequestToBackend(request, user, creditResult);
	} catch (error) {
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

async function forwardRequestToBackend(request: Request, user: UserData, creditResult: CreditResult): Promise<Response> {
	// Clone the request
	const newRequest = new Request(request);

	// Add useful headers for backend
	newRequest.headers.set('X-Apiki-User-Id', user.id);
	newRequest.headers.set('X-Apiki-Plan', user.plan);
	newRequest.headers.set('X-Apiki-Credits-Remaining', creditResult.remaining.toString());
	newRequest.headers.set('X-Apiki-Credits-Used', (creditResult.used || 0).toString());

	// Forward to backend
	// Note: In a real implementation, you would configure the actual backend URL
	const backendUrl = new URL(request.url);
	backendUrl.hostname = 'your-backend-api.example.com';

	// Create a new request with the same method, headers, and body
	const backendRequest = new Request(backendUrl.toString(), {
		method: request.method,
		headers: newRequest.headers,
		body: request.body,
		redirect: 'follow',
	});

	// Send request to backend
	const response = await fetch(backendRequest);

	// Clone the response and add our headers
	const newResponse = new Response(response.body, response);
	newResponse.headers.set('X-Apiki-Credits-Remaining', creditResult.remaining.toString());

	return newResponse;
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
