// Client service for gateway (minimal version)

import type { ClientData } from '@/shared/types';
import { KV_CLIENT } from '@/shared/utils/kv';

/**
 * Get client data - minimal implementation for gateway needs only
 */
export async function getClient(clientId: string, env: Env): Promise<ClientData | null> {
  // Get client data from KV
  return await KV_CLIENT.get<ClientData>(clientId, env);
}
