/**
 * Shared cryptographic utilities for the API Gateway
 */

/**
 * Generate a random API key with a specified format
 * Format: "apk_" + 24 characters (alphanumeric)
 */
export function generateApiKey(): string {
  const prefix = 'apk_';
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
