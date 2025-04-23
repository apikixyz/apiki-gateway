import type { ApiKeyConfig } from '@/shared/types';
import { errorResponse, successResponse } from '@/shared/utils/response';

import { createApiKeyConfig, deleteApiKeyConfig, getApiKeyConfig, updateApiKeyConfig } from '../services/apiKey';

/**
 * Handle API Key management requests
 */
export async function handleApiKeyRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // Check if the path has a valid format for a single API key /admin/api-keys/:id
    if (path.match(/^\/admin\/api-keys\/[^\/]+$/)) {
      const apiKeyId = path.split('/').pop();
      if (!apiKeyId) {
        return errorResponse(400, 'Invalid API Key ID');
      }

      // Get an API key config
      if (method === 'GET') {
        const apiKeyConfig = await getApiKeyConfig(apiKeyId, env);
        if (!apiKeyConfig) {
          return errorResponse(404, 'API Key not found');
        }

        return successResponse(apiKeyConfig);
      }

      // Update an API key config
      if (method === 'PUT') {
        const newApiKeyConfig = (await request.json()) as Pick<ApiKeyConfig, 'active' | 'expiresAt'>;
        const updatedApiKeyConfig = await updateApiKeyConfig(apiKeyId, newApiKeyConfig, env);
        if (!updatedApiKeyConfig) {
          return errorResponse(404, 'API Key not found');
        }

        return successResponse(updatedApiKeyConfig);
      }

      // Delete an API key config
      if (method === 'DELETE') {
        const success = await deleteApiKeyConfig(apiKeyId, env);
        if (!success) {
          return errorResponse(404, 'API Key not found');
        }

        return successResponse({ success });
      }
    }

    // POST /admin/api-keys - Create a new API key
    if (method === 'POST' && path === '/admin/api-keys') {
      const apiKeyConfig = (await request.json()) as Pick<ApiKeyConfig, 'clientId' | 'targetId' | 'expiresAt'>;

      if (!apiKeyConfig.clientId) {
        return errorResponse(400, 'Client ID is required');
      }

      // Create a new API key config
      const result = await createApiKeyConfig(apiKeyConfig.clientId, apiKeyConfig, env);
      return successResponse(result, 201);
    }

    // If no route matches
    return errorResponse(404, 'Not Found');
  } catch (error: unknown) {
    console.error('Error handling API key request:', error instanceof Error ? error.message : String(error));
    return errorResponse(500, 'Internal Server Error');
  }
}
