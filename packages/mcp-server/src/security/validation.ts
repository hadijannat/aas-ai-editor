/**
 * Input Validation
 *
 * Provides Zod-based input validation for MCP tool parameters.
 */

import { z } from 'zod';

/**
 * Common validation schemas
 */
export const schemas = {
  // Session ID: UUID format
  sessionId: z.string().uuid('Invalid session ID format'),

  // File path: non-empty string
  filePath: z.string().min(1, 'Path cannot be empty').max(4096, 'Path too long'),

  // Base64 content: valid base64 string
  base64Content: z.string().regex(/^[A-Za-z0-9+/=]*$/, 'Invalid base64 content'),

  // Filename: safe filename without path separators
  filename: z
    .string()
    .min(1, 'Filename cannot be empty')
    .max(255, 'Filename too long')
    .regex(/^[^/\\:*?"<>|]+$/, 'Filename contains invalid characters'),

  // JSON Pointer: valid JSON pointer format
  jsonPointer: z
    .string()
    .regex(/^(\/[^/~]*(~[01][^/~]*)*)*$/, 'Invalid JSON Pointer format')
    .or(z.literal('')),

  // Semantic ID: valid IRI/URI format
  semanticId: z.string().url('Invalid semantic ID format').or(z.string().startsWith('urn:')),

  // Patch operation
  patchOp: z.enum(['add', 'remove', 'replace', 'move', 'copy']),

  // Approval tier
  approvalTier: z.enum(['low', 'medium', 'high', 'critical']),

  // Format: output format
  format: z.enum(['aasx', 'json', 'xml']),

  // Positive integer
  positiveInt: z.number().int().positive(),

  // Non-negative integer
  nonNegativeInt: z.number().int().nonnegative(),
};

/**
 * Tool-specific input schemas
 */
export const toolSchemas = {
  // Document tools
  document_load: z.object({
    path: schemas.filePath,
  }),

  document_load_content: z.object({
    content: schemas.base64Content,
    filename: schemas.filename,
  }),

  document_save: z.object({
    path: schemas.filePath.optional(),
  }),

  document_export: z.object({
    format: schemas.format.optional(),
  }),

  // Query tools
  query_list_submodels: z.object({}),

  query_find_by_semantic_id: z.object({
    semanticId: z.string().min(1, 'Semantic ID cannot be empty'),
  }),

  query_get_by_path: z.object({
    submodelId: z.string().min(1, 'Submodel ID cannot be empty'),
    path: z.string().min(1, 'Path cannot be empty'), // Dot-separated idShort path (e.g., "ContactInformation.Street")
  }),

  query_list_elements: z.object({
    submodelId: z.string().min(1, 'Submodel ID cannot be empty'),
    collectionPath: z.string().optional(), // Optional path to SubmodelElementCollection
  }),

  query_get_pointer: z.object({
    submodelId: z.string().min(1, 'Submodel ID cannot be empty'),
    elementPath: z.string().min(1, 'Element path cannot be empty'), // Dot-separated idShort path
  }),

  query_diff: z.object({
    compareWith: z.enum(['undo', 'file']),
    fileContent: schemas.base64Content.optional(), // Required when compareWith="file"
    undoSteps: schemas.positiveInt.optional(), // Only when compareWith="undo"
  }),

  // Edit tools
  edit_add: z.object({
    path: schemas.jsonPointer,
    value: z.unknown(),
  }),

  edit_update: z.object({
    path: schemas.jsonPointer,
    value: z.unknown(),
  }),

  edit_delete: z.object({
    path: schemas.jsonPointer,
  }),

  edit_move: z.object({
    from: schemas.jsonPointer,
    to: schemas.jsonPointer,
  }),

  edit_copy: z.object({
    from: schemas.jsonPointer,
    to: schemas.jsonPointer,
  }),

  edit_batch: z.object({
    operations: z.array(
      z.object({
        op: schemas.patchOp,
        path: schemas.jsonPointer,
        value: z.unknown().optional(),
        from: schemas.jsonPointer.optional(),
      })
    ),
  }),

  // Validation tools
  validate_fast: z.object({}),

  validate_deep: z.object({
    serviceUrl: z.string().url().optional(),
  }),

  validate_summary: z.object({}),

  validate_template: z.object({
    submodelPath: schemas.jsonPointer,
    templateId: z.string().optional(),
  }),

  validate_auto_fix: z.object({
    errors: z.array(
      z.object({
        path: z.string(),
        message: z.string(),
        code: z.string().optional(),
        severity: z.string().optional(),
      })
    ),
    maxAttempts: schemas.positiveInt.max(10).optional(),
  }),

  // Import tools
  import_suggest_template: z.object({
    templateId: z.string().min(1, 'Template ID cannot be empty'),
    prefillData: z.record(z.unknown()).optional(),
    includeOptional: z.boolean().optional(),
  }),

  import_spreadsheet: z.object({
    filePath: schemas.filePath.optional(),
    base64Content: schemas.base64Content.optional(),
    fileType: z.enum(['csv', 'xlsx', 'xls']).optional(),
    mapping: z.record(z.string()).optional(),
    headerRow: schemas.positiveInt.optional(),
    templateId: z.string().optional(),
  }),

  import_aas: z.object({
    filePath: schemas.filePath.optional(),
    base64Content: schemas.base64Content.optional(),
    submodelIds: z.array(z.string()).optional(),
    mergeStrategy: z.enum(['replace', 'merge', 'skip']).optional(),
  }),

  import_pdf: z.object({
    filePath: schemas.filePath.optional(),
    base64Content: schemas.base64Content.optional(),
    targetSubmodel: z.string().optional(),
    pages: z.array(schemas.positiveInt).optional(),
    targetFields: z.array(z.string()).optional(),
  }),

  import_image: z.object({
    filePath: schemas.filePath.optional(),
    base64Content: schemas.base64Content.optional(),
    mimeType: z.string().optional(),
    targetFields: z.array(z.string()).optional(),
  }),

  // AI tools
  ai_chat: z.object({
    message: z.string().min(1, 'Message cannot be empty').max(32000, 'Message too long'),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
          toolCalls: z
            .array(
              z.object({
                name: z.string(),
                input: z.record(z.unknown()),
                result: z.unknown().optional(),
              })
            )
            .optional(),
        })
      )
      .max(100, 'Conversation history too long')
      .optional(),
    context: z
      .object({
        focusPath: schemas.jsonPointer.optional(),
      })
      .optional(),
  }),
};

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  data?: unknown;
  errors?: string[];
}

/**
 * Create an input validator for a tool
 */
export function createInputValidator(toolName: string) {
  const schema = toolSchemas[toolName as keyof typeof toolSchemas];

  if (!schema) {
    // Return a pass-through validator for unknown tools
    return {
      validate: (input: unknown): ValidationResult => ({
        valid: true,
        data: input,
      }),
      schema: undefined,
    };
  }

  return {
    validate: (input: unknown): ValidationResult => {
      const result = schema.safeParse(input);

      if (result.success) {
        return {
          valid: true,
          data: result.data,
        };
      }

      return {
        valid: false,
        errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    },
    schema,
  };
}

/**
 * Validate tool input with detailed error reporting
 */
export function validateToolInput(
  toolName: string,
  input: unknown
): ValidationResult {
  const validator = createInputValidator(toolName);
  return validator.validate(input);
}
