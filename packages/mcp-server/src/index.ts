/**
 * MCP Server Package Exports
 */

// Server
export { startServer } from './server.js';

// Transport
export { createTransportHandler, SessionManager } from './transport/index.js';
export type { TransportHandler, SessionConfig } from './transport/index.js';

// AI
export { AIClient } from './ai/index.js';
export type {
  AIClientConfig,
  AIMessage,
  CompletionOptions,
  CompletionResult,
} from './ai/index.js';

// Config
export { loadConfig, validateConfig } from './config/index.js';
export type { ServerConfig } from './config/index.js';

// Security
export {
  createAuthMiddleware,
  loadApiKeysFromEnv,
  hashApiKey,
  type AuthConfig,
} from './security/auth.js';
export {
  validatePath,
  isPathSafe,
  createPathValidator,
  loadAllowedDirectoriesFromEnv,
  type PathConfig,
} from './security/paths.js';
export {
  validateToolInput,
  createInputValidator,
  schemas as validationSchemas,
  toolSchemas,
} from './security/validation.js';

// Types
export type {
  ServerContext,
  SessionData,
  ClientIdentity,
  DocumentState,
  PendingOperation,
  ToolDefinition,
  ToolHandler,
  ToolContext,
  ToolResult,
  ResourceDefinition,
  ResourceHandler,
  ResourceContent,
  PromptDefinition,
  PromptHandler,
  PromptMessage,
} from './types.js';
