// Type definitions for APIKI Gateway

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

// Backend configuration interfaces
export interface BackendConfig {
	id: string;
	pattern: string; // URL pattern to match (can be regex or simple path)
	targetUrl: string; // The target backend URL
	isRegex: boolean; // Whether pattern is a regex
	addCreditsHeader: boolean; // Whether to add the credits header
	forwardApiKey: boolean; // Whether to forward the original API key
	customHeaders?: Record<string, string>; // Custom headers to add
	createdAt: string;
	updatedAt: string;
}

// Cloudflare Worker environment interface
export interface Env {
	APIKI_KV: KVNamespace;
	ADMIN_AUTH_KEY: string;
	ALLOWED_ORIGINS?: string;
}

// Extend global interfaces for Cloudflare Workers
export interface ExportedHandler<Env> {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}
