import type { CreditResult, TargetConfig } from '@/shared/types';
import { KV_CREDITS } from '@/shared/utils/kv';

/**
 * Process credits for a request
 */
export async function processCredits(targetConfig: TargetConfig, clientId: string, env: Env): Promise<CreditResult> {
  // Get the client balance
  const balance = await KV_CREDITS.getString(clientId, env);
  const clientBalance = balance ? parseInt(balance) : 0;

  // Check if the client has enough credits
  if (targetConfig.costInfo.cost > clientBalance) {
    return {
      success: false,
      remaining: clientBalance,
      used: 0,
    };
  }

  // Update the client balance
  const newBalance = clientBalance - targetConfig.costInfo.cost;
  await KV_CREDITS.putString(clientId, newBalance.toString(), env);

  return {
    success: true,
    remaining: newBalance,
    used: targetConfig.costInfo.cost,
  };
}
