/**
 * Utility for generating secure random keys and hashes
 */

/**
 * Generate a random API key with a specified format
 * Format: "akg_" + 24 characters (alphanumeric)
 */
export function generateRandomKey(): string {
  const prefix = 'akg_';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 24;

  let result = '';
  const randValues = new Uint8Array(length);
  crypto.getRandomValues(randValues);

  for (let i = 0; i < length; i++) {
    result += chars.charAt(randValues[i] % chars.length);
  }

  return prefix + result;
}

/**
 * Generate a secure hash from a string
 * @param input String to hash
 */
export async function generateHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generate a secure token for authentication
 */
export function generateSecureToken(): string {
  const tokenLength = 32;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  let result = '';
  const randValues = new Uint8Array(tokenLength);
  crypto.getRandomValues(randValues);

  for (let i = 0; i < tokenLength; i++) {
    result += chars.charAt(randValues[i] % chars.length);
  }

  return result;
}
