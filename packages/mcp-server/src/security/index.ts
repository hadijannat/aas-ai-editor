/**
 * Security Module
 *
 * Provides authentication, authorization, and input validation
 * for production deployment of the MCP server.
 */

export { createAuthMiddleware, type AuthConfig } from './auth.js';
export { validatePath, isPathSafe, type PathConfig } from './paths.js';
export { createInputValidator } from './validation.js';
