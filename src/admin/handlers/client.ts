import { Env, ClientData, CreateClientData } from '../../shared/types';
import { createClient, getClient, updateClient, deleteClient, listClients } from '../services/client';
import { logDebug } from '../../shared/utils/logging';
import { errorResponse, successResponse } from '../../shared/utils/response';

/**
 * Handle Client management requests
 */
export async function handleClientRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // GET /admin/clients - List all clients
    if (method === 'GET' && path === '/admin/clients') {
      const clients = await listClients(env);
      return successResponse({ clients });
    }

    // GET /admin/clients/:id - Get a specific client
    if (method === 'GET' && path.match(/^\/admin\/clients\/[^\/]+$/)) {
      const clientId = path.split('/').pop();
      if (!clientId) {
        return errorResponse(400, 'Invalid Client ID');
      }

      const client = await getClient(clientId, env);
      if (!client) {
        return errorResponse(404, 'Client not found');
      }

      return successResponse({ client });
    }

    // POST /admin/clients - Create a new client
    if (method === 'POST' && path === '/admin/clients') {
      const data = await request.json() as CreateClientData;

      if (!data.name) {
        return errorResponse(400, 'Client name is required');
      }

      const result = await createClient(data, env);
      return successResponse(result, 201);
    }

    // PUT /admin/clients/:id - Update a client
    if (method === 'PUT' && path.match(/^\/admin\/clients\/[^\/]+$/)) {
      const clientId = path.split('/').pop();
      if (!clientId) {
        return errorResponse(400, 'Invalid Client ID');
      }

      const data = await request.json() as Partial<ClientData>;
      const updated = await updateClient(clientId, data, env);

      if (!updated) {
        return errorResponse(404, 'Client not found');
      }

      return successResponse({ success: true, client: updated });
    }

    // DELETE /admin/clients/:id - Delete a client
    if (method === 'DELETE' && path.match(/^\/admin\/clients\/[^\/]+$/)) {
      const clientId = path.split('/').pop();
      if (!clientId) {
        return errorResponse(400, 'Invalid Client ID');
      }

      const success = await deleteClient(clientId, env);

      if (!success) {
        return errorResponse(404, 'Client not found');
      }

      return successResponse({ success: true });
    }

    // If no route matches
    return errorResponse(404, 'Not Found');
  } catch (error: unknown) {
    console.error('Error handling client request:', error instanceof Error ? error.message : String(error));
    return errorResponse(500, 'Internal Server Error');
  }
}
