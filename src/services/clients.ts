import { ClientData, CreateClientData, Env } from '../types';
import { SimpleCache } from '../utils/cache';

// Initialize client cache
const clientCache = new SimpleCache();

export async function getClient(clientId: string, env: Env): Promise<ClientData | null> {
	// Check cache first
	const cacheKey = `client:${clientId}`;
	const cachedClient = clientCache.get<ClientData>(cacheKey);
	if (cachedClient) {
		return cachedClient;
	}

	// Get client data from KV
	const clientData = (await env.APIKI_KV.get(`client:${clientId}`, { type: 'json' })) as ClientData | null;

	// Cache the result if found
	if (clientData) {
		clientCache.set(cacheKey, clientData);
	}

	return clientData;
}

export async function createClient(clientData: CreateClientData, env: Env): Promise<{ clientId: string }> {
	const clientId = crypto.randomUUID();

	// Create client - extract known properties first, then add remaining ones
	const { name, email, plan = 'free', type = 'personal', metadata = {} } = clientData;

	// Normalize email (lowercase)
	const normalizedEmail = email.toLowerCase();

	const client: ClientData = {
		id: clientId,
		createdAt: new Date().toISOString(),
		plan,
		name,
		email: normalizedEmail, // Store normalized email
		type,
		metadata,
	};

	// Store client data
	await env.APIKI_KV.put(`client:${clientId}`, JSON.stringify(client));

	// Store email reference for uniqueness checking
	await env.APIKI_KV.put(`email:${normalizedEmail}`, clientId);

	// Set initial credits based on plan
	const planCredits: Record<string, number> = {
		free: 100,
		basic: 1000,
		premium: 10000,
	};

	await env.APIKI_KV.put(
		`credits:${clientId}`,
		JSON.stringify({
			balance: planCredits[plan] || 100,
			lastUpdated: new Date().toISOString(),
		})
	);

	return { clientId };
}

export async function isEmailRegistered(email: string, env: Env): Promise<boolean> {
	// Create a normalized version of the email (lowercase)
	const normalizedEmail = email.toLowerCase();

	// Check if email exists in the system
	const clientId = await env.APIKI_KV.get(`email:${normalizedEmail}`);
	return clientId !== null;
}
