import { CreditData, CreditResult, Env } from '../types';

export async function processCredits(clientId: string, cost: number, env: Env): Promise<CreditResult> {
	// Get current credit balance
	const creditsKey = `credits:${clientId}`;
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

	// Track usage without blocking the main flow
	trackUsage(clientId, cost, env).catch((err) => console.error('Error tracking usage:', err));

	return {
		success: true,
		remaining: newBalance,
		used: cost,
	};
}

export async function addCredits(clientId: string, amount: number, env: Env): Promise<{ balance: number }> {
	// Get current credits
	const creditsKey = `credits:${clientId}`;
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

export async function trackUsage(clientId: string, amount: number, env: Env): Promise<void> {
	// Create usage key with today's date
	const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
	const usageKey = `usage:${clientId}:${today}`;

	// Get current usage
	const currentUsage = parseInt((await env.APIKI_KV.get(usageKey)) || '0');

	// Update usage
	await env.APIKI_KV.put(usageKey, (currentUsage + amount).toString(), {
		// Store daily usage for 90 days
		expirationTtl: 90 * 24 * 60 * 60,
	});
}

export function getEndpointCost(endpoint: string): number {
	// Define costs for different endpoints using patterns
	const costPatterns: Array<{ pattern: RegExp; cost: number }> = [
		// Exact matches
		{ pattern: /^\/api\/v1\/simple$/, cost: 1 },
		{ pattern: /^\/api\/v1\/search$/, cost: 2 },
		{ pattern: /^\/api\/v1\/complex$/, cost: 5 },

		// Pattern matches
		{ pattern: /^\/api\/v1\/images\/.*$/, cost: 3 },
		{ pattern: /^\/api\/v1\/data\/large\/.*$/, cost: 4 },

		// Catch-all for /api/v2 endpoints
		{ pattern: /^\/api\/v2\/.*$/, cost: 2 },
	];

	// Find matching pattern
	for (const { pattern, cost } of costPatterns) {
		if (pattern.test(endpoint)) {
			return cost;
		}
	}

	// Default cost for unmatched endpoints
	return 1;
}
