import { Env } from '../../shared/types';
import { createApiKey, getApiKey, updateApiKey, deleteApiKey, listApiKeys } from '../services/apiKey';
import { logDebug } from '../../shared/utils/logging';
import { errorResponse, successResponse } from '../../shared/utils/response';

/**
 * Handle API Key management requests
 */
export async function handleApiKeyRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // GET /admin/api-keys - List all API keys
    if (method === 'GET' && path === '/admin/api-keys') {
      const apiKeys = await listApiKeys(env);
      return successResponse({ apiKeys });
    }

    // GET /admin/api-keys/:id - Get a specific API key
    if (method === 'GET' && path.match(/^\/admin\/api-keys\/[^\/]+$/)) {
      const apiKeyId = path.split('/').pop();
      if (!apiKeyId) {
        return errorResponse(400, 'Invalid API Key ID');
      }

      const apiKey = await getApiKey(apiKeyId, env);
      if (!apiKey) {
        return errorResponse(404, 'API Key not found');
      }

      return successResponse({ apiKey });
    }

    // POST /admin/api-keys - Create a new API key
    if (method === 'POST' && path === '/admin/api-keys') {
      const data = await request.json() as { clientId: string; expiresAt?: string; restrictions?: Record<string, any>; name?: string };

      if (!data.clientId) {
        return errorResponse(400, 'Client ID is required');
      }

      const result = await createApiKey(data.clientId, data, env);
      return successResponse(result, 201);
    }

    // PUT /admin/api-keys/:id - Update an API key
    if (method === 'PUT' && path.match(/^\/admin\/api-keys\/[^\/]+$/)) {
      const apiKeyId = path.split('/').pop();
      if (!apiKeyId) {
        return errorResponse(400, 'Invalid API Key ID');
      }

      const data = await request.json() as Partial<{ active: boolean; expiresAt: string | null; restrictions: Record<string, any> }>;
      const updated = await updateApiKey(apiKeyId, data, env);

      if (!updated) {
        return errorResponse(404, 'API Key not found');
      }

      return successResponse({ success: true, apiKey: updated });
    }

    // DELETE /admin/api-keys/:id - Delete an API key
    if (method === 'DELETE' && path.match(/^\/admin\/api-keys\/[^\/]+$/)) {
      const apiKeyId = path.split('/').pop();
      if (!apiKeyId) {
        return errorResponse(400, 'Invalid API Key ID');
      }

      const success = await deleteApiKey(apiKeyId, env);

      if (!success) {
        return errorResponse(404, 'API Key not found');
      }

      return successResponse({ success: true });
    }

    // If no route matches
    return errorResponse(404, 'Not Found');
  } catch (error: unknown) {
    console.error('Error handling API key request:', error instanceof Error ? error.message : String(error));
    return errorResponse(500, 'Internal Server Error');
  }
}
