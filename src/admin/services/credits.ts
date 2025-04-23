import { KV_CREDITS } from '@/shared/utils/kv';

/**
 * Get credits by client ID
 */
export async function getCreditsByClientId(clientId: string, env: Env): Promise<number> {
  const balance = await KV_CREDITS.getString(clientId, env);
  const clientBalance = balance ? parseInt(balance) : 0;
  return clientBalance;
}

/**
 * Set credits by client ID. If the client ID does not exist, it will be created.
 */
export async function setCreditsByClientId(clientId: string, credits: number, env: Env): Promise<void> {
  await KV_CREDITS.putString(clientId, credits.toString(), env);
}
