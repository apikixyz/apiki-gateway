import { BackendConfig, CreateUserData, ApiKeyOptions, Env } from '../types';
import { errorResponse } from '../utils/response';
import { createUser, isEmailRegistered } from '../services/users';
import { createApiKey, deactivateApiKey } from '../services/apiKey';
import { addCredits } from '../services/credits';

export async function handleAdminRequest(request: Request, env: Env): Promise<Response> {
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
		const userData = await request.json() as CreateUserData;

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
				const data = await request.json() as { userId: string; options?: ApiKeyOptions };

				// Validate required fields
				if (!data.userId) {
					return errorResponse(400, 'User ID is required');
				}

				// Check if user exists
				const userKey = `user:${data.userId}`;
				const user = await env.APIKI_KV.get(userKey, { type: 'json' });
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
		const data = await request.json() as { userId: string; amount: number };

		// Validate required fields
		if (!data.userId) {
			return errorResponse(400, 'User ID is required');
		}

		// Validate amount
		if (typeof data.amount !== 'number' || data.amount <= 0) {
			return errorResponse(400, 'Amount must be a positive number');
		}

		// Check if user exists
		const userKey = `user:${data.userId}`;
		const user = await env.APIKI_KV.get(userKey, { type: 'json' });
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
				const data = await request.json() as Partial<BackendConfig> & { pattern: string; targetUrl: string };

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
