/**
 * MCP Server Types
 */

import type { Logger } from 'pino';
import type { SessionManager } from './transport/session.js';
import type { ServerConfig } from './config/index.js';

/**
 * Server-wide context passed to handlers
 */
export interface ServerContext {
  config: ServerConfig;
  logger: Logger;
  sessionManager: SessionManager;
}

/**
 * Session data stored per client connection
 */
export interface SessionData {
  /** Session identifier */
  id: string;

  /** When session was created */
  createdAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  /** Currently loaded document ID */
  documentId?: string;

  /** Document state for this session */
  documentState?: DocumentState;

  /** Pending operations awaiting approval */
  pendingOperations: PendingOperation[];
}

/**
 * Document state within a session
 */
export interface DocumentState {
  /** Document identifier (file path or URL) */
  id: string;

  /** Original filename */
  filename: string;

  /** AAS Environment data */
  environment: unknown;

  /** Whether there are unsaved changes */
  dirty: boolean;

  /** Undo stack */
  undoStack: unknown[];

  /** Redo stack */
  redoStack: unknown[];
}

/**
 * Operation pending user approval
 */
export interface PendingOperation {
  /** Operation identifier */
  id: string;

  /** Tool that generated this operation */
  toolName: string;

  /** Patches to apply */
  patches: unknown[];

  /** Approval tier required */
  approvalTier: number;

  /** Reason for the operation */
  reason: string;

  /** When operation was created */
  createdAt: Date;
}

/**
 * MCP Tool definition
 */
export interface ToolDefinition {
  /** Tool name */
  name: string;

  /** Tool description */
  description: string;

  /** JSON Schema for input parameters */
  inputSchema: Record<string, unknown>;

  /** Tool handler function */
  handler: ToolHandler;
}

/**
 * Tool handler function type
 */
export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

/**
 * Context passed to tool handlers
 */
export interface ToolContext {
  /** Server context */
  server: ServerContext;

  /** Current session */
  session: SessionData;

  /** Logger scoped to this tool */
  logger: Logger;
}

/**
 * Result from a tool execution
 */
export interface ToolResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Result data */
  data?: unknown;

  /** Error message if failed */
  error?: string;

  /** Operations requiring approval */
  pendingApproval?: PendingOperation[];
}

/**
 * MCP Resource definition
 */
export interface ResourceDefinition {
  /** Resource URI pattern */
  uri: string;

  /** Resource name */
  name: string;

  /** Resource description */
  description: string;

  /** MIME type */
  mimeType: string;

  /** Resource handler */
  handler: ResourceHandler;
}

/**
 * Resource handler function type
 */
export type ResourceHandler = (
  uri: string,
  context: ToolContext
) => Promise<ResourceContent>;

/**
 * Resource content
 */
export interface ResourceContent {
  /** Resource URI */
  uri: string;

  /** MIME type */
  mimeType: string;

  /** Content data */
  content: string | Uint8Array;
}

/**
 * MCP Prompt definition
 */
export interface PromptDefinition {
  /** Prompt name */
  name: string;

  /** Prompt description */
  description: string;

  /** Prompt arguments schema */
  arguments?: Record<string, unknown>;

  /** Prompt handler */
  handler: PromptHandler;
}

/**
 * Prompt handler function type
 */
export type PromptHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<PromptMessage[]>;

/**
 * Prompt message
 */
export interface PromptMessage {
  role: 'user' | 'assistant';
  content: string;
}
