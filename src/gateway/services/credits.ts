import type { CreditResult, TargetConfig } from '@/shared/types';
import { KV_CLIENT_BALANCE } from '@/shared/utils/kv';

/**
 * Process credits for a request - optimized version
 */
export async function processCredits(targetConfig: TargetConfig, clientId: string, env: Env): Promise<CreditResult> {
  // Get the client balance
  const balance = await KV_CLIENT_BALANCE.getString(clientId, env);
  const clientBalance = balance ? parseInt(balance) : 0;

  // Check if enough credits
  if (targetConfig.costInfo.cost < clientBalance) {
    return {
      success: false,
      remaining: clientBalance,
      used: targetConfig.costInfo.cost,
    };
  }

  // Update credits in consolidated gateway data
  const newBalance = clientBalance - targetConfig.costInfo.cost;
  await KV_CLIENT_BALANCE.putString(clientId, newBalance.toString(), env);

  return {
    success: true,
    remaining: newBalance,
    used: targetConfig.costInfo.cost,
  };
}
