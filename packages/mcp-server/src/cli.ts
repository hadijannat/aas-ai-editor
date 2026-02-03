#!/usr/bin/env node
/**
 * CLI Entry Point for AAS AI Editor MCP Server
 *
 * This file provides the command-line interface for starting the MCP server.
 * It is the entry point for the `aas-mcp-server` command installed via npm.
 *
 * Usage:
 *   npx @aas-ai-editor/mcp-server
 *   # or after global install:
 *   aas-mcp-server
 *
 * Environment Variables:
 *   MCP_PORT              - Server port (default: 3001)
 *   MCP_API_KEY           - API key for authentication (optional)
 *   MCP_API_KEYS          - Comma-separated API keys (optional)
 *   MCP_ALLOWED_PATHS     - Comma-separated allowed directories
 *   CORS_ALLOWED_ORIGINS  - Comma-separated allowed CORS origins
 *   NODE_ENV              - Environment (development/production)
 */

import { startServer } from './server.js';

// Display version and startup info
const packageVersion = '0.1.0';
console.log(`AAS AI Editor MCP Server v${packageVersion}`);
console.log('Starting server...\n');

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
