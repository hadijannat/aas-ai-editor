/**
 * MCP Server Entry Point
 *
 * Streamable HTTP server implementing the Model Context Protocol
 * for AI-assisted AASX editing with Claude integration.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import { createTransportHandler } from './transport/handler.js';
import { SessionManager } from './transport/session.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { loadConfig, validateConfig } from './config/index.js';
import { createAuthMiddleware, loadApiKeysFromEnv } from './security/auth.js';
import { loadAllowedDirectoriesFromEnv } from './security/paths.js';
import type { ServerContext } from './types.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

/**
 * Start the MCP server
 */
export async function startServer(): Promise<void> {
  const config = loadConfig();

  // Validate configuration
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    console.error('Configuration errors:', configErrors);
    process.exit(1);
  }

  const app = express();

  // Trust proxy for accurate IP detection behind reverse proxies (nginx, load balancers)
  // Set to 1 for single proxy, or 'loopback' for localhost proxies only
  if (process.env.TRUST_PROXY) {
    const trustValue = process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY;
    app.set('trust proxy', trustValue);
  }

  // Security middleware - enable CSP/COEP in production
  const isDev = process.env.NODE_ENV !== 'production';
  app.use(
    helmet({
      contentSecurityPolicy: isDev ? false : undefined,
      crossOriginEmbedderPolicy: isDev ? false : undefined,
    })
  );

  // CORS configuration - trim whitespace from origins
  // Note: credentials:true is incompatible with origin:'*', so disable credentials if wildcard
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').map((o) => o.trim());
  const isWildcard = allowedOrigins?.includes('*');
  const corsOptions = {
    origin: isWildcard ? '*' : (allowedOrigins || ['http://localhost:5173']),
    credentials: !isWildcard, // Disable credentials for wildcard origins (browser requirement)
    exposedHeaders: ['X-Session-Id'],
    methods: ['GET', 'POST', 'OPTIONS'],
  };
  app.use(cors(corsOptions));

  // Rate limiting - use IP only (X-Session-Id is untrusted user input)
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || 'unknown',
  });
  app.use('/mcp', limiter);

  // API Key Authentication
  const apiKeys = loadApiKeysFromEnv();
  const authMiddleware = createAuthMiddleware({
    apiKeys,
    publicEndpoints: ['/health', '/'],
    enabled: apiKeys.length > 0, // Only enable if keys are configured
  });
  app.use('/mcp', authMiddleware);

  // Log security configuration
  const allowedDirs = loadAllowedDirectoriesFromEnv();
  logger.info({
    authEnabled: apiKeys.length > 0,
    apiKeyCount: apiKeys.length,
    allowedDirectories: allowedDirs,
    corsOrigins: allowedOrigins,
    rateLimit: process.env.RATE_LIMIT_MAX || '100',
  }, 'Security configuration loaded');

  // Body parser middleware
  app.use(express.json({ limit: '50mb' }));

  // Create server context
  const sessionManager = new SessionManager(config.session);
  const context: ServerContext = {
    config,
    logger,
    sessionManager,
  };

  // Create transport handler
  const transportHandler = createTransportHandler(context);

  // Register MCP capabilities
  registerTools(transportHandler);
  registerResources(transportHandler);
  registerPrompts(transportHandler);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  // MCP Streamable HTTP endpoint
  app.post('/mcp', transportHandler.handleRequest);

  // SSE endpoint for streaming responses
  app.get('/mcp/stream/:sessionId', transportHandler.handleStream);

  // Start server
  const port = config.server.port;
  app.listen(port, () => {
    logger.info({ port }, 'MCP server listening');
  });
}

// Start if run directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
