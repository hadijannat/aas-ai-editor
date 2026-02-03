/**
 * Document Tools
 *
 * Tools for document lifecycle management:
 * - Loading and parsing AASX files
 * - Saving with packaging
 * - Undo/redo operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  readAasx,
  writeAasx,
  applyPatches,
  type AasPatchOp,
  type Environment,
} from '@aas-ai-editor/core';
import type { ToolDefinition, ToolResult } from '../types.js';

/**
 * Undo entry stored on the undo stack
 */
interface UndoEntry {
  /** Human-readable description of the operation */
  description: string;
  /** Inverse patches to apply for undo */
  inversePatches: AasPatchOp[];
  /** Original patches (for redo) */
  originalPatches: AasPatchOp[];
}

/**
 * Load an AASX document
 */
const loadDocument: ToolDefinition = {
  name: 'document_load',
  description: 'Load and parse an AASX or JSON file from local filesystem. Returns the AAS Environment structure.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Local file path to the AASX or JSON file',
      },
    },
    required: ['path'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { path: filePath } = params as { path: string };
    const { logger, session } = context;

    logger.info({ path: filePath }, 'Loading document');

    try {
      // Read the file from disk
      const fileData = await fs.readFile(filePath);

      // Detect JSON vs AASX
      const isJson = filePath.endsWith('.json') || fileData[0] === 0x7b; // 0x7b = '{'

      let environment: Environment;
      let filename: string;
      let warnings: string[] = [];
      let supplementaryFiles: Map<string, Uint8Array> = new Map();

      if (isJson) {
        // Parse as JSON environment directly
        const jsonContent = fileData.toString('utf-8');
        environment = JSON.parse(jsonContent) as Environment;
        filename = path.basename(filePath);
        logger.info({ path: filePath }, 'Loaded JSON environment');
      } else {
        // Parse as AASX using core library
        const result = await readAasx(fileData);
        environment = result.environment;
        filename = result.filename;
        warnings = result.warnings;
        supplementaryFiles = result.supplementaryFiles;
      }

      // Store in session state (track source format for proper round-trip)
      session.documentId = filePath;
      session.documentState = {
        id: filePath,
        filename: filename || path.basename(filePath),
        environment,
        dirty: false,
        undoStack: [],
        redoStack: [],
        supplementaryFiles,
        sourceFormat: isJson ? 'json' : 'aasx',
      };

      // Log any parsing warnings
      if (warnings.length > 0) {
        logger.warn({ warnings }, 'AASX parsing warnings');
      }

      // Get summary of loaded content
      const env = environment as Environment;
      const summary = {
        assetAdministrationShells: env.assetAdministrationShells?.length || 0,
        submodels: env.submodels?.length || 0,
        conceptDescriptions: env.conceptDescriptions?.length || 0,
      };

      return {
        success: true,
        data: {
          documentId: filePath,
          filename: session.documentState.filename,
          summary,
          warnings: warnings.length > 0 ? warnings : undefined,
          message: 'Document loaded successfully',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading document';
      logger.error({ error, path: filePath }, 'Failed to load document');
      return {
        success: false,
        error: message,
      };
    }
  },
};

/**
 * Save the current document
 */
const saveDocument: ToolDefinition = {
  name: 'document_save',
  description: 'Save the current document. Format is determined by output path extension (.json for JSON, .aasx for AASX) or source format.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Output file path (optional, uses original path if not provided)',
      },
    },
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { path: outputFilePath } = params as { path?: string };
    const { logger, session } = context;

    if (!session.documentState) {
      return {
        success: false,
        error: 'No document loaded',
      };
    }

    const outputPath = outputFilePath || session.documentId;
    if (!outputPath) {
      return {
        success: false,
        error: 'No output path specified and no original document path available',
      };
    }

    // Prevent writing to virtual content:// paths (from browser uploads)
    if (outputPath.startsWith('content://')) {
      return {
        success: false,
        error: 'Cannot save to content:// path. Specify an explicit file path or use document_export for browser downloads.',
        data: {
          hint: 'Use the document_export tool to get base64 content for browser download, or provide an explicit output path.',
          currentDocumentId: outputPath,
        },
      };
    }

    logger.info({ outputPath }, 'Saving document');

    try {
      const environment = session.documentState.environment as Environment;

      // Determine output format from path extension or source format
      const isJsonOutput = outputPath.endsWith('.json') ||
        (session.documentState.sourceFormat === 'json' && !outputPath.endsWith('.aasx'));

      let outputData: Buffer | Uint8Array;
      let size: number;

      if (isJsonOutput) {
        // Write as JSON
        const jsonContent = JSON.stringify(environment, null, 2);
        outputData = Buffer.from(jsonContent, 'utf-8');
        size = outputData.byteLength;
        logger.info({ outputPath, format: 'json' }, 'Saving as JSON');
      } else {
        // Write as AASX using core library, preserving supplementary files
        const aasxData = await writeAasx(environment, {
          filename: path.basename(outputPath).replace(/\.aasx$/, '.json'),
          supplementaryFiles: session.documentState.supplementaryFiles,
        });
        outputData = aasxData;
        size = aasxData.byteLength;
        logger.info({ outputPath, format: 'aasx' }, 'Saving as AASX');
      }

      // Write to disk
      await fs.writeFile(outputPath, outputData);

      // Update state
      session.documentState.dirty = false;
      session.documentId = outputPath;

      return {
        success: true,
        data: {
          path: outputPath,
          size,
          format: isJsonOutput ? 'json' : 'aasx',
          message: 'Document saved successfully',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error saving document';
      logger.error({ error, outputPath }, 'Failed to save document');
      return {
        success: false,
        error: message,
      };
    }
  },
};

/**
 * Undo the last operation
 */
const undoOperation: ToolDefinition = {
  name: 'document_undo',
  description: 'Undo the last edit operation.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_params, context): Promise<ToolResult> => {
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No document loaded' };
    }

    if (session.documentState.undoStack.length === 0) {
      return { success: false, error: 'Nothing to undo' };
    }

    // Pop from undo stack
    const undoEntry = session.documentState.undoStack.pop() as UndoEntry;
    logger.info({ description: undoEntry.description }, 'Undoing operation');

    // Apply inverse patches to restore previous state
    const result = applyPatches(
      session.documentState.environment as Environment,
      undoEntry.inversePatches
    );

    if (!result.success) {
      // Put the entry back on the stack since undo failed
      session.documentState.undoStack.push(undoEntry);
      return {
        success: false,
        error: `Failed to undo: ${result.error}`,
      };
    }

    // Update environment with the result
    session.documentState.environment = result.result;
    session.documentState.dirty = true;

    // Push to redo stack (with original patches for redo, inverse patches for re-undo)
    session.documentState.redoStack.push({
      description: undoEntry.description,
      inversePatches: undoEntry.originalPatches, // To redo, apply original patches
      originalPatches: undoEntry.inversePatches, // To re-undo, apply inverse again
    } as UndoEntry);

    return {
      success: true,
      data: {
        undoneOperation: undoEntry.description,
        canUndo: session.documentState.undoStack.length > 0,
        canRedo: session.documentState.redoStack.length > 0,
        message: 'Undo successful',
      },
    };
  },
};

/**
 * Redo the last undone operation
 */
const redoOperation: ToolDefinition = {
  name: 'document_redo',
  description: 'Redo the last undone operation.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_params, context): Promise<ToolResult> => {
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No document loaded' };
    }

    if (session.documentState.redoStack.length === 0) {
      return { success: false, error: 'Nothing to redo' };
    }

    // Pop from redo stack
    const redoEntry = session.documentState.redoStack.pop() as UndoEntry;
    logger.info({ description: redoEntry.description }, 'Redoing operation');

    // Apply the inverse patches (which for redo entries are actually the original patches)
    const result = applyPatches(
      session.documentState.environment as Environment,
      redoEntry.inversePatches
    );

    if (!result.success) {
      // Put the entry back on the stack since redo failed
      session.documentState.redoStack.push(redoEntry);
      return {
        success: false,
        error: `Failed to redo: ${result.error}`,
      };
    }

    // Update environment with the result
    session.documentState.environment = result.result;
    session.documentState.dirty = true;

    // Push to undo stack
    session.documentState.undoStack.push({
      description: redoEntry.description,
      inversePatches: redoEntry.originalPatches, // To undo again, apply these
      originalPatches: redoEntry.inversePatches, // These were used for redo
    } as UndoEntry);

    return {
      success: true,
      data: {
        redoneOperation: redoEntry.description,
        canUndo: session.documentState.undoStack.length > 0,
        canRedo: session.documentState.redoStack.length > 0,
        message: 'Redo successful',
      },
    };
  },
};

/**
 * Load document from content (for browser uploads)
 */
const loadDocumentContent: ToolDefinition = {
  name: 'document_load_content',
  description: 'Load and parse an AASX or JSON document from base64-encoded content. Used for browser file uploads.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Base64-encoded file content',
      },
      filename: {
        type: 'string',
        description: 'Original filename (used for format detection)',
      },
    },
    required: ['content', 'filename'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { content, filename } = params as { content: string; filename: string };
    const { logger, session } = context;

    logger.info({ filename }, 'Loading document from content');

    try {
      // Decode base64 content
      const fileData = Buffer.from(content, 'base64');

      // Detect JSON vs AASX
      const isJson = filename.endsWith('.json') || fileData[0] === 0x7b; // 0x7b = '{'

      let environment: Environment;
      let warnings: string[] = [];
      let supplementaryFiles: Map<string, Uint8Array> = new Map();

      if (isJson) {
        // Parse as JSON environment directly
        const jsonContent = fileData.toString('utf-8');
        environment = JSON.parse(jsonContent) as Environment;
        logger.info({ filename }, 'Loaded JSON environment from content');
      } else {
        // Parse as AASX using core library
        const result = await readAasx(fileData);
        environment = result.environment;
        warnings = result.warnings;
        supplementaryFiles = result.supplementaryFiles;
      }

      // Generate a unique document ID for content-based loads
      const documentId = `content://${filename}-${Date.now()}`;

      // Store in session state (track source format for proper round-trip)
      session.documentId = documentId;
      session.documentState = {
        id: documentId,
        filename,
        environment,
        dirty: false,
        undoStack: [],
        redoStack: [],
        supplementaryFiles,
        sourceFormat: isJson ? 'json' : 'aasx',
      };

      // Log any parsing warnings
      if (warnings.length > 0) {
        logger.warn({ warnings }, 'AASX parsing warnings');
      }

      // Get summary of loaded content
      const env = environment as Environment;
      const summary = {
        assetAdministrationShells: env.assetAdministrationShells?.length || 0,
        submodels: env.submodels?.length || 0,
        conceptDescriptions: env.conceptDescriptions?.length || 0,
      };

      return {
        success: true,
        data: {
          documentId,
          filename,
          summary,
          warnings: warnings.length > 0 ? warnings : undefined,
          message: 'Document loaded successfully',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading document';
      logger.error({ error, filename }, 'Failed to load document from content');
      return {
        success: false,
        error: message,
      };
    }
  },
};

/**
 * Get document status
 */
const getDocumentStatus: ToolDefinition = {
  name: 'document_status',
  description: 'Get the current document status including dirty state and undo/redo availability.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_params, context): Promise<ToolResult> => {
    const { session } = context;

    if (!session.documentState) {
      return {
        success: true,
        data: { loaded: false },
      };
    }

    return {
      success: true,
      data: {
        loaded: true,
        documentId: session.documentId,
        filename: session.documentState.filename,
        dirty: session.documentState.dirty,
        canUndo: session.documentState.undoStack.length > 0,
        canRedo: session.documentState.redoStack.length > 0,
        pendingApprovals: session.pendingOperations.length,
      },
    };
  },
};

/**
 * Export document as base64 (for browser downloads)
 */
const exportDocument: ToolDefinition = {
  name: 'document_export',
  description: 'Export the current document as base64-encoded data. Used for browser downloads. Defaults to source format if not specified.',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['aasx', 'json'],
        description: 'Export format (default: source format or aasx)',
      },
    },
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { format: requestedFormat } = params as { format?: 'aasx' | 'json' };
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No document loaded' };
    }

    // Default to source format if not specified
    const format = requestedFormat || session.documentState.sourceFormat || 'aasx';
    logger.info({ format, sourceFormat: session.documentState.sourceFormat }, 'Exporting document');

    try {
      const environment = session.documentState.environment as Environment;
      const baseFilename = session.documentState.filename?.replace(/\.(aasx|json)$/i, '') || 'document';

      if (format === 'json') {
        // Export as JSON
        const jsonContent = JSON.stringify(environment, null, 2);
        const base64Content = Buffer.from(jsonContent, 'utf-8').toString('base64');
        return {
          success: true,
          data: {
            content: base64Content,
            mimeType: 'application/json',
            filename: `${baseFilename}.json`,
            message: 'Document exported as JSON',
          },
        };
      }

      // Export as AASX, preserving supplementary files
      const aasxData = await writeAasx(environment, {
        filename: `${baseFilename}.json`, // Internal JSON filename within AASX
        supplementaryFiles: session.documentState.supplementaryFiles,
      });

      const base64Content = Buffer.from(aasxData).toString('base64');

      return {
        success: true,
        data: {
          content: base64Content,
          mimeType: 'application/asset-administration-shell-package+xml',
          filename: `${baseFilename}.aasx`, // Always .aasx for AASX format
          message: 'Document exported as AASX',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error exporting document';
      logger.error({ error }, 'Failed to export document');
      return { success: false, error: message };
    }
  },
};

export const documentTools: ToolDefinition[] = [
  loadDocument,
  loadDocumentContent,
  saveDocument,
  exportDocument,
  undoOperation,
  redoOperation,
  getDocumentStatus,
];

// Export UndoEntry type for use by edit tools
export type { UndoEntry };
