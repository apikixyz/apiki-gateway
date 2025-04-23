import { errorResponse, successResponse } from '@/shared/utils/response';

import { getCreditsByClientId, setCreditsByClientId } from '../services/credits';

/**
 * Validates credit value to ensure it meets system requirements
 * @param credits The credit amount to validate
 * @param requireValue Whether the credits value is required (default: true)
 * @returns Error message if validation fails, null if validation passes
 */
function validateCredits(credits: number | undefined, requireValue = true): string | null {
  // Check if credits is defined when required
  if (requireValue && (credits === undefined || credits === null)) {
    return 'Credits value is required';
  }

  // Skip further validation if credits is not provided
  if (credits === undefined || credits === null) {
    return null;
  }

  // Check if credits is a number
  if (typeof credits !== 'number' || isNaN(credits)) {
    return 'Credits must be a valid number';
  }

  // Check if credits is not negative
  if (credits < 0) {
    return 'Credits cannot be negative';
  }

  // Check if credits is not greater than the maximum allowed
  if (credits > 1000000) {
    return 'Credits cannot be greater than 1,000,000';
  }

  // Validation passed
  return null;
}

/**
 * Handle credits management requests
 */
export async function handleCreditRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // Check if the path has a valid format for a single credit /admin/credits/:clientId
    if (path.match(/^\/admin\/credits\/[^\/]+$/)) {
      const clientId = path.split('/').pop();
      if (!clientId) {
        return errorResponse(400, 'Invalid Client ID');
      }

      // Get a credit info
      if (method === 'GET') {
        const credits = await getCreditsByClientId(clientId, env);
        return successResponse({ clientId, credits });
      }

      // Update a credit info
      if (method === 'PUT') {
        const { credits } = (await request.json()) as { credits: number };

        const validationError = validateCredits(credits);
        if (validationError) {
          return errorResponse(400, validationError);
        }

        // Set the credits
        await setCreditsByClientId(clientId, credits, env);
        return successResponse({ clientId, credits });
      }
    }

    // POST /admin/credits - Create a new credit balance for a client
    if (method === 'POST' && path === '/admin/credits') {
      const { clientId, credits } = (await request.json()) as { clientId: string; credits: number };

      // Check if the client ID already exists
      const currentCredits = await getCreditsByClientId(clientId, env);
      if (currentCredits) {
        return errorResponse(400, 'Client ID already exists');
      }

      // Validate clientId
      if (!clientId) {
        return errorResponse(400, 'Client ID is required');
      }

      const validationError = validateCredits(credits);
      if (validationError) {
        return errorResponse(400, validationError);
      }

      // Set the credits
      await setCreditsByClientId(clientId, credits, env);
      return successResponse({ clientId, credits });
    }

    // If no route matches
    return errorResponse(404, 'Not Found');
  } catch (error) {
    console.error('Error handling credit request:', error instanceof Error ? error.message : String(error));
    return errorResponse(500, 'Internal Server Error');
  }
}
