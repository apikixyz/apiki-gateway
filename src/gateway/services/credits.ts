// Credits service for gateway

import type { CreditData, CreditResult } from '@/shared/types';
import { KV_CREDITS } from '@/shared/utils/kv';

/**
 * Process credits for a request - core gateway functionality
 */
export async function processCredits(clientId: string, cost: number, env: Env): Promise<CreditResult> {
  // Get current credit balance
  const creditData = (await KV_CREDITS.get<CreditData>(clientId, env)) || {
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
  const updated = {
    balance: newBalance,
    lastUpdated: new Date().toISOString(),
  };

  await KV_CREDITS.put(clientId, updated, env);

  return {
    success: true,
    remaining: newBalance,
    used: cost,
  };
}

/**
 * Get cost for a request - simple implementation
 */
export function getRequestCost(path: string): number {
  // Define costs for different endpoints using patterns
  const costPatterns: Array<{ pattern: RegExp; cost: number }> = [
    // Exact matches
    { pattern: /^\/api\/v1\/simple$/, cost: 1 },
    { pattern: /^\/api\/v1\/normal$/, cost: 2 },
    { pattern: /^\/api\/v1\/complex$/, cost: 5 },

    // // Pattern matches
    // { pattern: /^\/api\/v1\/images\/.*$/, cost: 3 },
    // { pattern: /^\/api\/v1\/data\/large\/.*$/, cost: 4 },

    // // Catch-all for /api/v2 endpoints
    // { pattern: /^\/api\/v2\/.*$/, cost: 2 },
  ];

  // Find matching pattern
  for (const { pattern, cost } of costPatterns) {
    if (pattern.test(path)) {
      return cost;
    }
  }

  // Default cost for unmatched endpoints
  return 1;
}
