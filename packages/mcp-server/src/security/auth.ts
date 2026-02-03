/**
 * Authentication Middleware
 *
 * Provides API key authentication for the MCP server.
 * Supports both X-API-Key header and Bearer token authentication.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /** API keys that are allowed to access the server (hashed for security) */
  apiKeys: string[];

  /** Endpoints that don't require authentication */
  publicEndpoints: string[];

  /** Whether authentication is enabled */
  enabled: boolean;
}

/**
 * Default authentication configuration
 */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  apiKeys: [],
  publicEndpoints: ['/health', '/'],
  enabled: true,
};

/**
 * Hash an API key for secure comparison
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Timing-safe comparison of API keys to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(config: Partial<AuthConfig> = {}) {
  const fullConfig: AuthConfig = { ...DEFAULT_AUTH_CONFIG, ...config };

  // Pre-hash API keys for secure comparison
  const hashedKeys = fullConfig.apiKeys.map((k) => hashApiKey(k));

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip if authentication is disabled
    if (!fullConfig.enabled) {
      next();
      return;
    }

    // Allow public endpoints
    if (fullConfig.publicEndpoints.some((ep) => req.path === ep || req.path.startsWith(ep + '/'))) {
      next();
      return;
    }

    // No API keys configured = authentication disabled
    if (hashedKeys.length === 0) {
      next();
      return;
    }

    // Extract API key from request
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Authentication required. Provide API key via X-API-Key header or Bearer token.',
        },
      });
      return;
    }

    // Validate API key
    const hashedInput = hashApiKey(apiKey);
    const isValid = hashedKeys.some((hk) => safeCompare(hashedInput, hk));

    if (!isValid) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'Invalid API key',
        },
      });
      return;
    }

    next();
  };
}

/**
 * Extract API key from request headers
 */
function extractApiKey(req: Request): string | undefined {
  // Check X-API-Key header first
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
    return apiKeyHeader;
  }

  // Check Authorization header for Bearer token
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return undefined;
}

/**
 * Load API keys from environment variable
 * Supports comma-separated list of keys
 */
export function loadApiKeysFromEnv(): string[] {
  const envKeys = process.env.MCP_API_KEYS;
  if (!envKeys) {
    return [];
  }

  return envKeys
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}
