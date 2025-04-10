// Client management service for admin
import { ClientData, CreateClientData, Env } from '../../shared/types';
import { logDebug } from '../../shared/utils/logging';
import { KeyPrefixes } from '../../shared/utils/kv';
import { SimpleCache } from '../../shared/utils/cache';
import { generateApiKey } from '../../shared/utils/crypto';

// Cache for clients list
const clientsListCache = new SimpleCache();
const CLIENT_LIST_KEY = 'clients:list';

/**
 * List all clients
 */
export async function listClients(env: Env): Promise<{ id: string; data: ClientData }[]> {
  try {
    // Try to get the list of clients from cache first
    let clientsIdList = clientsListCache.get<string[]>(CLIENT_LIST_KEY);

    // If not in cache, get from KV
    if (!clientsIdList) {
      clientsIdList = await env.APIKI_KV.get(CLIENT_LIST_KEY, { type: 'json' }) as string[] || [];
      if (clientsIdList.length > 0) {
        clientsListCache.set(CLIENT_LIST_KEY, clientsIdList, 300000); // Cache for 5 minutes
      }
    }

    // If we have a client list, use it for more efficient lookup
    if (clientsIdList && clientsIdList.length > 0) {
      // Get all clients in parallel
      const clients = await Promise.all(
        clientsIdList.map(async (id) => {
          const data = await KeyPrefixes.CLIENT.get<ClientData>(id, env);
          return { id, data: data || null };
        })
      );

      return clients.filter(client => client.data !== null) as { id: string; data: ClientData }[];
    }

    // Fallback to listing all keys with the CLIENT prefix
    const prefix = KeyPrefixes.CLIENT.key('').split(':')[0] + ':';
    const keys = await env.APIKI_KV.list({ prefix });

    // Get the data for each key in parallel
    const clients = await Promise.all(
      keys.keys.map(async (key) => {
        // Extract the key ID from the full KV key name
        const id = key.name.substring(prefix.length);
        const data = await KeyPrefixes.CLIENT.get<ClientData>(id, env);
        return { id, data: data || null };
      })
    );

    // Filter out any keys with null data
    return clients.filter(client => client.data !== null) as { id: string; data: ClientData }[];
  } catch (error) {
    console.error('Error listing clients:', error);
    return [];
  }
}

/**
 * Get a client by its ID
 */
export async function getClient(clientId: string, env: Env): Promise<ClientData | null> {
  try {
    return await KeyPrefixes.CLIENT.get<ClientData>(clientId, env);
  } catch (error) {
    console.error('Error getting client:', error);
    return null;
  }
}

/**
 * Create a new client
 */
export async function createClient(
  data: CreateClientData,
  env: Env
): Promise<{ id: string; client: ClientData }> {
  try {
    // Generate a random client ID
    const clientId = generateApiKey().substring(4); // Remove the prefix

    // Prepare client data
    const clientData: ClientData = {
      id: clientId,
      createdAt: new Date().toISOString(),
      plan: data.plan || 'free',
      name: data.name,
      email: data.email,
      type: data.type || 'personal',
      metadata: data.metadata || {},
    };

    // Store the client
    await KeyPrefixes.CLIENT.put(clientId, clientData, env);

    // Add to clients list for easier lookup
    let clientsList = clientsListCache.get<string[]>(CLIENT_LIST_KEY);
    if (!clientsList) {
      clientsList = await env.APIKI_KV.get(CLIENT_LIST_KEY, { type: 'json' }) as string[] || [];
    }

    if (!clientsList.includes(clientId)) {
      clientsList.push(clientId);
      await env.APIKI_KV.put(CLIENT_LIST_KEY, JSON.stringify(clientsList));
      // Update cache
      clientsListCache.set(CLIENT_LIST_KEY, clientsList, 300000);
    }

    logDebug('admin', `Created new client ${clientId}`);

    return { id: clientId, client: clientData };
  } catch (error) {
    console.error('Error creating client:', error);
    throw error;
  }
}

/**
 * Update a client
 */
export async function updateClient(
  clientId: string,
  updates: Partial<ClientData>,
  env: Env
): Promise<ClientData | null> {
  try {
    // Get the current client data
    const currentData = await KeyPrefixes.CLIENT.get<ClientData>(clientId, env);

    if (!currentData) {
      return null;
    }

    // Update the data
    const updatedData: ClientData = {
      ...currentData,
      ...updates,
      // Don't allow these fields to be changed
      id: currentData.id,
      createdAt: currentData.createdAt,
    };

    // Store the updated client
    await KeyPrefixes.CLIENT.put(clientId, updatedData, env);

    logDebug('admin', `Updated client ${clientId}`);

    return updatedData;
  } catch (error) {
    console.error('Error updating client:', error);
    return null;
  }
}

/**
 * Delete a client
 */
export async function deleteClient(clientId: string, env: Env): Promise<boolean> {
  try {
    // Check if client exists
    const client = await KeyPrefixes.CLIENT.get<ClientData>(clientId, env);
    if (!client) {
      return false;
    }

    // Delete the client
    await KeyPrefixes.CLIENT.delete(clientId, env);

    // Update the clients list
    let clientsList = clientsListCache.get<string[]>(CLIENT_LIST_KEY);
    if (!clientsList) {
      clientsList = await env.APIKI_KV.get(CLIENT_LIST_KEY, { type: 'json' }) as string[] || [];
    }

    const updatedList = clientsList.filter(id => id !== clientId);
    if (clientsList.length !== updatedList.length) {
      await env.APIKI_KV.put(CLIENT_LIST_KEY, JSON.stringify(updatedList));
      // Update cache
      clientsListCache.set(CLIENT_LIST_KEY, updatedList, 300000);
    }

    // Also delete any API keys associated with this client
    const clientKeysKey = `client:${clientId}:keys`;
    const clientKeys = await env.APIKI_KV.get(clientKeysKey, { type: 'json' }) as string[] || [];

    // Delete each API key in parallel
    if (clientKeys.length > 0) {
      await Promise.all(
        clientKeys.map(async (apiKey) => {
          await KeyPrefixes.API_KEY.delete(apiKey, env);
        })
      );

      // Delete the client keys list
      await env.APIKI_KV.delete(clientKeysKey);
    }

    logDebug('admin', `Deleted client ${clientId}`);

    return true;
  } catch (error) {
    console.error('Error deleting client:', error);
    return false;
  }
}
