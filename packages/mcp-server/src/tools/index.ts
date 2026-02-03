/**
 * MCP Tools Registration
 *
 * Registers all available tools with the transport handler.
 * Tools are organized by domain: document, query, edit, validate, import, ai.
 */

import type { TransportHandler } from '../transport/handler.js';
import { documentTools } from './document.js';
import { queryTools } from './query.js';
import { editTools } from './edit.js';
import { validateTools } from './validate.js';
import { importTools } from './import.js';
import { aiTools } from './ai.js';

/**
 * Register all tools with the transport handler
 */
export function registerTools(handler: TransportHandler): void {
  // Document lifecycle tools
  for (const tool of documentTools) {
    handler.registerTool(tool);
  }

  // Query and navigation tools
  for (const tool of queryTools) {
    handler.registerTool(tool);
  }

  // Edit and patch tools
  for (const tool of editTools) {
    handler.registerTool(tool);
  }

  // Validation tools
  for (const tool of validateTools) {
    handler.registerTool(tool);
  }

  // Import tools
  for (const tool of importTools) {
    handler.registerTool(tool);
  }

  // AI assistant tools
  for (const tool of aiTools) {
    handler.registerTool(tool);
  }
}
