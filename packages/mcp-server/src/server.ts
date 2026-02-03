/**
 * MCP Server Entry Point
 *
 * Streamable HTTP server implementing the Model Context Protocol
 * for AI-assisted AASX editing with Claude integration.
 */

import express from 'express';
import pino from 'pino';
import { createTransportHandler } from './transport/handler.js';
import { SessionManager } from './transport/session.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { loadConfig } from './config/index.js';
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
  const app = express();

  // Middleware
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
