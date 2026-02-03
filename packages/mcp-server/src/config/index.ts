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
      timeoutMs: parseInt(process.env.MCP_SESSION_TIMEOUT_MS || '1800000', 10), // 30 min
      maxSessions: parseInt(process.env.MCP_MAX_SESSIONS || '100', 10),
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

  // ANTHROPIC_API_KEY is optional - only needed for AI-assisted features like auto-fix
  // When running as MCP server for Claude Desktop, the client provides its own AI
  if (!config.ai.apiKey && process.env.NODE_ENV === 'production') {
    console.warn('Warning: ANTHROPIC_API_KEY not set. AI-assisted features (auto-fix) will be disabled.');
  }

  // Check for NaN values from parseInt before numeric comparisons
  if (!Number.isFinite(config.server.port)) {
    errors.push('MCP_SERVER_PORT must be a valid number');
  } else if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('MCP_SERVER_PORT must be between 1 and 65535');
  }

  if (!Number.isFinite(config.session.timeoutMs)) {
    errors.push('MCP_SESSION_TIMEOUT_MS must be a valid number');
  } else if (config.session.timeoutMs !== undefined && config.session.timeoutMs <= 0) {
    errors.push('MCP_SESSION_TIMEOUT_MS must be positive');
  }

  if (!Number.isFinite(config.session.maxSessions)) {
    errors.push('MCP_MAX_SESSIONS must be a valid number');
  } else if (config.session.maxSessions !== undefined && config.session.maxSessions <= 0) {
    errors.push('MCP_MAX_SESSIONS must be positive');
  }

  if (!Number.isFinite(config.ai.maxTokens)) {
    errors.push('AI_MAX_TOKENS must be a valid number');
  }

  return errors;
}
