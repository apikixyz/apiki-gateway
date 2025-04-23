import { errorResponse, successResponse } from '@/shared/utils/response';
import { getCreditsByClientId, updateCreditsByClientId } from '../services/credits';

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
        await updateCreditsByClientId(clientId, credits, env);
        return successResponse({ clientId, credits });
      }
    }

    // If no route matches
    return errorResponse(404, 'Not Found');
  } catch (error) {
    console.error('Error handling credit request:', error instanceof Error ? error.message : String(error));
    return errorResponse(500, 'Internal Server Error');
  }
}
