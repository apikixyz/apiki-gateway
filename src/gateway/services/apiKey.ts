import type { ApiKeyConfig } from '@/shared/types';
import { KV_API_KEY } from '@/shared/utils/kv';

/**
 * Get API key config
 */
export async function getApiKeyConfig(apiKey: string, env: Env): Promise<ApiKeyConfig | null> {
  const keyData = await KV_API_KEY.get<ApiKeyConfig>(apiKey, env);
  return keyData;
}
