/**
 * Server Configuration
 *
 * Loads configuration from environment variables and defaults.
 */

import type { SessionConfig } from '../transport/session.js';
import type { AIClientConfig } from '../ai/client.js';

/**
 * Full server configuration
 */
export interface ServerConfig {
  /** HTTP server settings */
  server: {
    port: number;
    host: string;
  };

  /** Session management settings */
  session: Partial<SessionConfig>;

  /** AI client settings */
  ai: Partial<AIClientConfig>;

  /** External service URLs */
  services: {
    validationUrl?: string;
  };

  /** Logging settings */
  logging: {
    level: string;
    pretty: boolean;
  };
}

/**
 * Load configuration from environment
 */
export function loadConfig(): ServerConfig {
  return {
    server: {
      port: parseInt(process.env.MCP_SERVER_PORT || '3001', 10),
      host: process.env.MCP_SERVER_HOST || '0.0.0.0',
    },

    session: {
      timeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS || '1800000', 10), // 30 min
      maxSessions: parseInt(process.env.MAX_SESSIONS || '100', 10),
    },

    ai: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.AI_MODEL || 'claude-sonnet-4-20250514',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4096', 10),
      enableCaching: process.env.AI_ENABLE_CACHING !== 'false',
    },

    services: {
      validationUrl: process.env.VALIDATION_SERVICE_URL,
    },

    logging: {
      level: process.env.LOG_LEVEL || 'info',
      pretty: process.env.NODE_ENV !== 'production',
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: ServerConfig): string[] {
  const errors: string[] = [];

  if (!config.ai.apiKey) {
    errors.push('ANTHROPIC_API_KEY environment variable is required');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('MCP_SERVER_PORT must be between 1 and 65535');
  }

  return errors;
}
