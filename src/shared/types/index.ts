// API Key related interfaces
export interface ApiKeyData {
  clientId: string;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  restrictions: Record<string, any>;
}

export interface ApiKeyOptions {
  expiresAt?: string;
  restrictions?: Record<string, any>;
  name?: string;
}

// Client related interfaces
export interface ClientData {
  id: string;
  createdAt: string;
  plan: string;
  name: string;
  email?: string; // Optional for non-human clients
  type: 'service' | 'application' | 'personal';
  metadata: Record<string, any>;
}

export interface CreateClientData {
  plan?: string;
  name: string;
  email?: string; // Optional for non-human clients
  type?: 'service' | 'application' | 'personal';
  metadata?: Record<string, any>;
}

// Credits related interfaces
export interface CreditData {
  balance: number;
  lastUpdated: string;
}

export interface CreditResult {
  success: boolean;
  remaining: number;
  used?: number;
}

// Target configuration interfaces
export interface TargetConfig {
  id: string;
  pattern: string; // URL pattern to match (can be regex or simple path)
  targetUrl: string; // The destination URL to forward requests to
  isRegex: boolean; // Whether pattern is a regex
  addCreditsHeader: boolean; // Whether to add the credits header
  forwardApiKey: boolean; // Whether to forward the original API key
  customHeaders?: Record<string, string>; // Custom headers to add
  createdAt: string;
  updatedAt: string;
}
