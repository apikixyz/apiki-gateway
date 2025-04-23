import type { ApiKeyConfig } from '@/shared/types';
import { errorResponse, successResponse } from '@/shared/utils/response';

import { createApiKeyConfig, deleteApiKeyConfig, getApiKeyConfig, updateApiKeyConfig } from '../services/apiKey';

/**
 * Validates API key configuration values
 * @param config The API key configuration to validate
 * @param isUpdate Whether this is for an update operation (different required fields)
 * @returns Error message if validation fails, null if validation passes
 */
function validateApiKeyConfig(config: Partial<ApiKeyConfig>, isUpdate = false): string | null {
  // Validate required fields for creation
  if (!isUpdate) {
    if (!config.clientId) {
      return 'Client ID is required';
    }

    if (!config.targetId) {
      return 'Target ID is required';
    }

    if (!config.expiresAt) {
      return 'Expires At is required';
    }
  }

  // Validate active field if present
  if (config.active !== undefined && typeof config.active !== 'boolean') {
    return 'Active must be a boolean';
  }

  // Validate expiresAt if present
  if (config.expiresAt) {
    // Convert string dates to numbers if needed
    const expiresAtValue = typeof config.expiresAt === 'string' ? new Date(config.expiresAt).getTime() : config.expiresAt;

    if (isNaN(expiresAtValue)) {
      return 'Expires At must be a valid date';
    }

    if (expiresAtValue < Date.now()) {
      return 'Expires At cannot be in the past';
    }

    if (expiresAtValue > Date.now() + 31536000000) {
      // 1 year in milliseconds
      return 'Expires At cannot be more than 1 year from now';
    }

    if (expiresAtValue < Date.now() + 60000) {
      // 1 minute in milliseconds
      return 'Expires At cannot be less than 1 minute from now';
    }
  }

  // Validation passed
  return null;
}

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

        // Validate the request body
        const validationError = validateApiKeyConfig(newApiKeyConfig, true);
        if (validationError) {
          return errorResponse(400, validationError);
        }

        // Update the API key config
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

      // Validate the request body
      const validationError = validateApiKeyConfig(apiKeyConfig);
      if (validationError) {
        return errorResponse(400, validationError);
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
