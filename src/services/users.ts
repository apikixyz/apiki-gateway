import { UserData, CreateUserData, Env } from '../types';
import { SimpleCache } from '../utils/cache';

// Initialize user cache
const userCache = new SimpleCache();

export async function getUser(userId: string, env: Env): Promise<UserData | null> {
	// Check cache first
	const cacheKey = `user:${userId}`;
	const cachedUser = userCache.get<UserData>(cacheKey);
	if (cachedUser) {
		return cachedUser;
	}

	// Get user data from KV
	const userData = (await env.APIKI_KV.get(`user:${userId}`, { type: 'json' })) as UserData | null;

	// Cache the result if found
	if (userData) {
		userCache.set(cacheKey, userData);
	}

	return userData;
}

export async function createUser(userData: CreateUserData, env: Env): Promise<{ userId: string }> {
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

export async function isEmailRegistered(email: string, env: Env): Promise<boolean> {
	// Create a normalized version of the email (lowercase)
	const normalizedEmail = email.toLowerCase();

	// Check if email exists in the system
	const userId = await env.APIKI_KV.get(`email:${normalizedEmail}`);
	return userId !== null;
}
