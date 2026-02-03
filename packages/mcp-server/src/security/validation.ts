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
    path: schemas.jsonPointer,
  }),

  query_list_elements: z.object({
    path: schemas.jsonPointer.optional(),
  }),

  query_get_pointer: z.object({
    idShort: z.string().min(1, 'idShort cannot be empty'),
    parentPath: schemas.jsonPointer.optional(),
  }),

  query_diff: z.object({
    path: schemas.jsonPointer.optional(),
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
    maxIterations: schemas.positiveInt.max(10).optional(),
    autoApprove: z.boolean().optional(),
  }),

  // Import tools
  import_suggest_template: z.object({
    submodelPath: schemas.jsonPointer.optional(),
  }),

  import_spreadsheet: z.object({
    content: schemas.base64Content,
    filename: schemas.filename,
    mapping: z.record(z.string()).optional(),
  }),

  import_aas: z.object({
    content: schemas.base64Content,
    filename: schemas.filename,
    mergeStrategy: z.enum(['replace', 'merge', 'append']).optional(),
  }),

  import_pdf: z.object({
    content: schemas.base64Content,
    filename: schemas.filename,
    extractionMode: z.enum(['text', 'structured', 'ocr']).optional(),
  }),

  import_image: z.object({
    content: schemas.base64Content,
    filename: schemas.filename,
    analysisMode: z.enum(['ocr', 'vision', 'both']).optional(),
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
