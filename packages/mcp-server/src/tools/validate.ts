/**
 * Validation Tools
 *
 * Tools for validating AAS data:
 * - Fast validation (TypeScript/Zod)
 * - Deep validation (Python aas-test-engines)
 * - Template validation (IDTA templates)
 * - Self-correcting loop support
 */

import {
  validateEnvironment,
  validateAgainstTemplate,
  createPatch,
  ApprovalTier,
  type Environment,
  type Submodel,
  type ValidationResult,
  type AasPatchOp,
} from '@aas-ai-editor/core';
import type { ToolDefinition, ToolResult } from '../types.js';

/**
 * Run fast validation
 */
const validateFast: ToolDefinition = {
  name: 'validate_fast',
  description: 'Run fast local validation (schema, required fields, basic constraints).',
  inputSchema: {
    type: 'object',
    properties: {
      submodelId: {
        type: 'string',
        description: 'Optional: validate specific submodel only',
      },
    },
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { submodelId } = params as { submodelId?: string };
    const { session, logger } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment;
    logger.info({ submodelId }, 'Running fast validation');

    let validationTarget: Environment;

    if (submodelId) {
      // Validate only the specified submodel
      const submodel = env.submodels?.find(
        (sm) => sm.id === submodelId || sm.idShort === submodelId
      );

      if (!submodel) {
        return {
          success: false,
          error: `Submodel not found: ${submodelId}`,
        };
      }

      // Create a minimal environment with just this submodel for validation
      validationTarget = {
        assetAdministrationShells: [],
        submodels: [submodel],
        conceptDescriptions: [],
      };
    } else {
      validationTarget = env;
    }

    // Run the validation
    const result: ValidationResult = validateEnvironment(validationTarget);

    return {
      success: true,
      data: {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        scope: submodelId ? `Submodel: ${submodelId}` : 'Full document',
        checkedAt: new Date().toISOString(),
      },
    };
  },
};

/**
 * Run deep validation via Python service
 */
const validateDeep: ToolDefinition = {
  name: 'validate_deep',
  description:
    'Run deep validation using aas-test-engines (requires validation service). More thorough but slower.',
  inputSchema: {
    type: 'object',
    properties: {
      submodelId: {
        type: 'string',
        description: 'Optional: validate specific submodel only',
      },
    },
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { submodelId } = params as { submodelId?: string };
    const { session, logger, server } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    logger.info({ submodelId }, 'Running deep validation');

    const validationServiceUrl = server.config.services?.validationUrl;
    if (!validationServiceUrl) {
      return {
        success: false,
        error: 'Validation service not configured. Set VALIDATION_SERVICE_URL environment variable.',
      };
    }

    const env = session.documentState.environment as Environment;

    try {
      // Prepare the request body
      let requestBody: object;
      if (submodelId) {
        const submodel = env.submodels?.find(
          (sm) => sm.id === submodelId || sm.idShort === submodelId
        );
        if (!submodel) {
          return {
            success: false,
            error: `Submodel not found: ${submodelId}`,
          };
        }
        requestBody = {
          assetAdministrationShells: [],
          submodels: [submodel],
          conceptDescriptions: [],
        };
      } else {
        requestBody = env;
      }

      // Call the validation service
      const response = await fetch(`${validationServiceUrl}/validate/json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText }, 'Validation service error');
        return {
          success: false,
          error: `Validation service returned ${response.status}: ${errorText}`,
        };
      }

      const validationResult = (await response.json()) as {
        valid: boolean;
        errors?: Array<{ path: string; code: string; message: string; severity: string }>;
        warnings?: Array<{ path: string; code: string; message: string; severity: string }>;
      };

      return {
        success: true,
        data: {
          valid: validationResult.valid,
          errors: validationResult.errors || [],
          warnings: validationResult.warnings || [],
          testSuite: 'aas-test-engines',
          scope: submodelId ? `Submodel: ${submodelId}` : 'Full document',
          checkedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error }, 'Failed to call validation service');
      return {
        success: false,
        error: `Failed to reach validation service: ${message}`,
      };
    }
  },
};

/**
 * Validate against IDTA template
 */
const validateTemplate: ToolDefinition = {
  name: 'validate_template',
  description: 'Validate a submodel against its IDTA template constraints.',
  inputSchema: {
    type: 'object',
    properties: {
      submodelId: {
        type: 'string',
        description: 'The submodel to validate',
      },
      templateId: {
        type: 'string',
        description: 'Optional: specific template ID (uses semanticId if not provided)',
      },
    },
    required: ['submodelId'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { submodelId, templateId } = params as {
      submodelId: string;
      templateId?: string;
    };
    const { session, logger } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment & { submodels?: Submodel[] };
    logger.info({ submodelId, templateId }, 'Running template validation');

    // Find the submodel by id or idShort
    const submodel = env.submodels?.find(
      (sm) => sm.id === submodelId || sm.idShort === submodelId
    );

    if (!submodel) {
      return {
        success: false,
        error: `Submodel not found: ${submodelId}`,
      };
    }

    // Run template validation
    const result = validateAgainstTemplate(submodel, templateId);

    return {
      success: true,
      data: {
        valid: result.valid,
        templateId: result.templateId,
        errors: result.errors,
        warnings: result.warnings,
        autoFixable: result.errors
          .filter((e) => e.autoFixable)
          .map((e) => ({ path: e.path, constraintType: e.constraintType })),
        checkedAt: new Date().toISOString(),
      },
    };
  },
};

/**
 * Validation error with additional context for fix generation
 */
interface ValidationErrorInput {
  path: string;
  message: string;
  code?: string;
  severity?: 'error' | 'warning';
  currentValue?: unknown;
}

/**
 * Fix suggestion generated by the auto-fix logic
 */
interface FixSuggestion {
  error: ValidationErrorInput;
  patch: AasPatchOp;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
}

/**
 * Categorize an error and determine its fix strategy
 */
function categorizeError(error: ValidationErrorInput): {
  category: string;
  autoFixable: boolean;
  strategy: string;
} {
  const { code, message, path } = error;
  const lowerMessage = message.toLowerCase();

  // Missing required field
  if (code === 'REQUIRED_FIELD' || lowerMessage.includes('must have') || lowerMessage.includes('required')) {
    if (path.endsWith('/id')) {
      return {
        category: 'missing_id',
        autoFixable: true,
        strategy: 'generate_unique_id',
      };
    }
    if (path.endsWith('/idShort')) {
      return {
        category: 'missing_idShort',
        autoFixable: true,
        strategy: 'generate_idShort_from_context',
      };
    }
    if (path.endsWith('/modelType')) {
      return {
        category: 'missing_modelType',
        autoFixable: true,
        strategy: 'infer_modelType_from_structure',
      };
    }
    if (path.endsWith('/valueType')) {
      return {
        category: 'missing_valueType',
        autoFixable: true,
        strategy: 'infer_valueType_from_value',
      };
    }
    if (path.endsWith('/assetInformation')) {
      return {
        category: 'missing_assetInformation',
        autoFixable: true,
        strategy: 'add_default_assetInformation',
      };
    }
    return {
      category: 'missing_required',
      autoFixable: false,
      strategy: 'manual_fix_required',
    };
  }

  // Missing semantic ID (warning, lower priority)
  if (code === 'MISSING_SEMANTIC_ID' || lowerMessage.includes('semanticid')) {
    return {
      category: 'missing_semanticId',
      autoFixable: false, // Requires domain knowledge
      strategy: 'suggest_semanticId',
    };
  }

  // Invalid value format
  if (lowerMessage.includes('invalid') || lowerMessage.includes('format')) {
    return {
      category: 'invalid_format',
      autoFixable: false,
      strategy: 'manual_format_correction',
    };
  }

  // Broken reference
  if (lowerMessage.includes('reference') || lowerMessage.includes('not found')) {
    return {
      category: 'broken_reference',
      autoFixable: false,
      strategy: 'manual_reference_fix',
    };
  }

  // Default: unknown error type
  return {
    category: 'unknown',
    autoFixable: false,
    strategy: 'manual_fix_required',
  };
}

/**
 * Generate a fix patch for a categorized error
 */
function generateFixPatch(
  error: ValidationErrorInput,
  category: { category: string; strategy: string },
  env: Environment
): FixSuggestion | null {
  const { path } = error;

  switch (category.category) {
    case 'missing_id': {
      // Generate a unique ID based on path context
      const timestamp = Date.now().toString(36);
      const generatedId = `https://example.com/generated/${timestamp}`;
      return {
        error,
        patch: createPatch('add', path, generatedId, {
          reason: `Auto-generated ID for missing required field`,
          aiGenerated: true,
          approvalTier: ApprovalTier.HIGH,
        }),
        confidence: 'medium',
        explanation: `Generated placeholder ID. You should replace this with a proper identifier.`,
      };
    }

    case 'missing_idShort': {
      // Generate idShort from path context
      const pathParts = path.split('/');
      const parentPath = pathParts.slice(0, -1).join('/');
      const index = parentPath.match(/\/(\d+)$/)?.[1];
      const generatedIdShort = `Element_${index || Date.now().toString(36)}`;
      return {
        error,
        patch: createPatch('add', path, generatedIdShort, {
          reason: `Auto-generated idShort for missing required field`,
          aiGenerated: true,
          approvalTier: ApprovalTier.HIGH,
        }),
        confidence: 'medium',
        explanation: `Generated placeholder idShort "${generatedIdShort}". Consider renaming to something meaningful.`,
      };
    }

    case 'missing_modelType': {
      // Infer modelType from structure or default to 'Property'
      const defaultModelType = 'Property';
      return {
        error,
        patch: createPatch('add', path, defaultModelType, {
          reason: `Auto-set modelType to default value`,
          aiGenerated: true,
          approvalTier: ApprovalTier.HIGH,
        }),
        confidence: 'low',
        explanation: `Set modelType to "${defaultModelType}". Verify this is the correct element type.`,
      };
    }

    case 'missing_valueType': {
      // Check if there's a value to infer type from
      const valuePath = path.replace('/valueType', '/value');
      const value = getNestedValue(env, valuePath);
      let inferredType = 'xs:string'; // Default

      if (typeof value === 'number') {
        inferredType = Number.isInteger(value) ? 'xs:integer' : 'xs:double';
      } else if (typeof value === 'boolean') {
        inferredType = 'xs:boolean';
      }

      return {
        error,
        patch: createPatch('add', path, inferredType, {
          reason: `Auto-inferred valueType from existing value`,
          aiGenerated: true,
          approvalTier: ApprovalTier.MEDIUM,
        }),
        confidence: value !== undefined ? 'high' : 'medium',
        explanation: `Inferred valueType as "${inferredType}"${value !== undefined ? ' from existing value' : ' (default)'}.`,
      };
    }

    case 'missing_assetInformation': {
      // Add minimal required assetInformation
      const defaultAssetInfo = {
        assetKind: 'Instance',
        globalAssetId: `https://example.com/asset/${Date.now().toString(36)}`,
      };
      return {
        error,
        patch: createPatch('add', path, defaultAssetInfo, {
          reason: `Auto-generated minimal assetInformation`,
          aiGenerated: true,
          approvalTier: ApprovalTier.HIGH,
        }),
        confidence: 'medium',
        explanation: `Added default assetInformation with placeholder globalAssetId. Update with actual asset identifier.`,
      };
    }

    default:
      return null;
  }
}

/**
 * Get a nested value from the environment using a JSON Pointer path
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!path || path === '/') return obj;
  const parts = path.split('/').filter(Boolean);
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index)) return undefined;
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Auto-fix validation errors (self-correcting loop)
 */
const autoFixErrors: ToolDefinition = {
  name: 'validate_auto_fix',
  description:
    'Attempt to auto-fix validation errors. Analyzes errors and generates fix patches for user approval.',
  inputSchema: {
    type: 'object',
    properties: {
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'string' },
            severity: { type: 'string' },
          },
        },
        description: 'Validation errors to fix (from validate_fast or validate_deep)',
      },
      maxAttempts: {
        type: 'number',
        description: 'Maximum auto-fix attempts per error (default: 3)',
      },
    },
    required: ['errors'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { errors, maxAttempts = 3 } = params as {
      errors: ValidationErrorInput[];
      maxAttempts?: number;
    };
    const { session, logger } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    if (!errors || errors.length === 0) {
      return {
        success: true,
        data: {
          message: 'No errors to fix',
          fixedCount: 0,
          remainingErrors: [],
          attemptsMade: 0,
          pendingPatches: [],
        },
      };
    }

    const env = session.documentState.environment as Environment;
    logger.info({ errorCount: errors.length, maxAttempts }, 'Starting auto-fix analysis');

    const fixSuggestions: FixSuggestion[] = [];
    const unfixableErrors: Array<ValidationErrorInput & { reason: string }> = [];
    let attemptsMade = 0;

    // Process each error
    for (const error of errors) {
      if (attemptsMade >= maxAttempts * errors.length) {
        // Safety limit on total attempts
        break;
      }

      attemptsMade++;
      const categorization = categorizeError(error);

      logger.debug(
        { path: error.path, category: categorization.category, autoFixable: categorization.autoFixable },
        'Categorized error'
      );

      if (!categorization.autoFixable) {
        unfixableErrors.push({
          ...error,
          reason: `Category "${categorization.category}" requires manual fix: ${categorization.strategy}`,
        });
        continue;
      }

      // Generate fix patch
      const fix = generateFixPatch(error, categorization, env);
      if (fix) {
        fixSuggestions.push(fix);
      } else {
        unfixableErrors.push({
          ...error,
          reason: `Unable to generate fix for category "${categorization.category}"`,
        });
      }
    }

    logger.info(
      {
        fixable: fixSuggestions.length,
        unfixable: unfixableErrors.length,
        attempts: attemptsMade,
      },
      'Auto-fix analysis complete'
    );

    // Group patches by confidence for user
    const highConfidence = fixSuggestions.filter((f) => f.confidence === 'high');
    const mediumConfidence = fixSuggestions.filter((f) => f.confidence === 'medium');
    const lowConfidence = fixSuggestions.filter((f) => f.confidence === 'low');

    return {
      success: true,
      data: {
        summary: {
          totalErrors: errors.length,
          fixable: fixSuggestions.length,
          unfixable: unfixableErrors.length,
          attemptsMade,
        },
        suggestions: {
          highConfidence: highConfidence.map((f) => ({
            path: f.error.path,
            originalMessage: f.error.message,
            explanation: f.explanation,
            patch: f.patch,
          })),
          mediumConfidence: mediumConfidence.map((f) => ({
            path: f.error.path,
            originalMessage: f.error.message,
            explanation: f.explanation,
            patch: f.patch,
          })),
          lowConfidence: lowConfidence.map((f) => ({
            path: f.error.path,
            originalMessage: f.error.message,
            explanation: f.explanation,
            patch: f.patch,
          })),
        },
        pendingPatches: fixSuggestions.map((f) => f.patch),
        remainingErrors: unfixableErrors,
        message:
          fixSuggestions.length > 0
            ? `Generated ${fixSuggestions.length} fix suggestion(s). Review and approve patches to apply.`
            : `No auto-fixable errors found. ${unfixableErrors.length} error(s) require manual intervention.`,
      },
    };
  },
};

/**
 * Get validation summary
 */
const getValidationSummary: ToolDefinition = {
  name: 'validate_summary',
  description: 'Get a summary of validation status for the entire document.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_params, context): Promise<ToolResult> => {
    const { session, logger } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment;
    logger.info('Running validation summary');

    // Run fast validation on the full environment
    const result = validateEnvironment(env);

    // Group errors and warnings by submodel
    const submodelErrors: Record<string, number> = {};
    const submodelWarnings: Record<string, number> = {};

    // Count errors per submodel
    for (const error of result.errors) {
      const match = error.path.match(/^\/submodels\/(\d+)/);
      if (match) {
        const index = parseInt(match[1], 10);
        const sm = env.submodels?.[index];
        const key = sm?.idShort || sm?.id || `submodel-${index}`;
        submodelErrors[key] = (submodelErrors[key] || 0) + 1;
      }
    }

    // Count warnings per submodel
    for (const warning of result.warnings) {
      const match = warning.path.match(/^\/submodels\/(\d+)/);
      if (match) {
        const index = parseInt(match[1], 10);
        const sm = env.submodels?.[index];
        const key = sm?.idShort || sm?.id || `submodel-${index}`;
        submodelWarnings[key] = (submodelWarnings[key] || 0) + 1;
      }
    }

    // Calculate valid submodels (no errors)
    const submodelCount = env.submodels?.length || 0;
    const submodelsWithErrors = Object.keys(submodelErrors).length;
    const validSubmodels = submodelCount - submodelsWithErrors;

    // Create per-submodel summary
    const submodelSummary = (env.submodels || []).map((sm, index) => {
      const key = sm.idShort || sm.id || `submodel-${index}`;
      return {
        idShort: sm.idShort,
        id: sm.id,
        semanticId: sm.semanticId?.keys?.[0]?.value,
        errors: submodelErrors[key] || 0,
        warnings: submodelWarnings[key] || 0,
        valid: !submodelErrors[key],
      };
    });

    return {
      success: true,
      data: {
        valid: result.valid,
        submodelCount,
        validSubmodels,
        aasCount: env.assetAdministrationShells?.length || 0,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        errors: result.errors,
        warnings: result.warnings,
        submodelSummary,
        checkedAt: new Date().toISOString(),
      },
    };
  },
};

/**
 * Self-correcting validation loop with retry
 *
 * Implements the full loop:
 * 1. Run validation
 * 2. Categorize errors
 * 3. Generate fixes
 * 4. Apply fixes
 * 5. Re-validate
 * 6. Retry up to N times
 * 7. Escalate remaining errors
 */
const selfCorrectingLoop: ToolDefinition = {
  name: 'validate_self_correct',
  description:
    'Run a self-correcting validation loop that automatically fixes errors and re-validates. Retries up to 3 times, then escalates unfixable errors.',
  inputSchema: {
    type: 'object',
    properties: {
      submodelId: {
        type: 'string',
        description: 'Optional: validate specific submodel only',
      },
      maxRetries: {
        type: 'number',
        description: 'Maximum retry attempts (default: 3)',
      },
      applyFixes: {
        type: 'boolean',
        description: 'Whether to apply high-confidence fixes automatically (default: false)',
      },
    },
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { submodelId, maxRetries = 3, applyFixes = false } = params as {
      submodelId?: string;
      maxRetries?: number;
      applyFixes?: boolean;
    };
    const { session, logger } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    logger.info({ submodelId, maxRetries, applyFixes }, 'Starting self-correcting validation loop');

    interface LoopIteration {
      attempt: number;
      errorCount: number;
      warningCount: number;
      fixesGenerated: number;
      fixesApplied: number;
      remainingErrors: ValidationErrorInput[];
    }

    const iterations: LoopIteration[] = [];
    const currentEnv = session.documentState.environment as Environment;
    let allGeneratedPatches: AasPatchOp[] = [];
    let totalFixesApplied = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info({ attempt }, 'Running validation iteration');

      // Step 1: Run validation
      let validationTarget: Environment;
      if (submodelId) {
        const submodel = currentEnv.submodels?.find(
          (sm) => sm.id === submodelId || sm.idShort === submodelId
        );
        if (!submodel) {
          return { success: false, error: `Submodel not found: ${submodelId}` };
        }
        validationTarget = {
          assetAdministrationShells: [],
          submodels: [submodel],
          conceptDescriptions: [],
        };
      } else {
        validationTarget = currentEnv;
      }

      const validationResult = validateEnvironment(validationTarget);
      const errors = validationResult.errors as ValidationErrorInput[];

      logger.debug(
        { errorCount: errors.length, warningCount: validationResult.warnings.length },
        'Validation completed'
      );

      // If no errors, we're done
      if (errors.length === 0) {
        iterations.push({
          attempt,
          errorCount: 0,
          warningCount: validationResult.warnings.length,
          fixesGenerated: 0,
          fixesApplied: 0,
          remainingErrors: [],
        });

        logger.info({ attempt, totalFixesApplied }, 'Self-correcting loop completed successfully');

        return {
          success: true,
          data: {
            status: 'valid',
            message: `Document is valid after ${attempt} iteration(s)${totalFixesApplied > 0 ? ` with ${totalFixesApplied} fix(es) applied` : ''}.`,
            iterations,
            finalValid: true,
            allGeneratedPatches,
            totalFixesApplied,
            warnings: validationResult.warnings,
          },
        };
      }

      // Step 2: Categorize and generate fixes
      const fixSuggestions: FixSuggestion[] = [];
      const unfixableErrors: ValidationErrorInput[] = [];

      for (const error of errors) {
        const categorization = categorizeError(error);

        if (!categorization.autoFixable) {
          unfixableErrors.push(error);
          continue;
        }

        const fix = generateFixPatch(error, categorization, currentEnv);
        if (fix) {
          fixSuggestions.push(fix);
        } else {
          unfixableErrors.push(error);
        }
      }

      logger.debug(
        { fixable: fixSuggestions.length, unfixable: unfixableErrors.length },
        'Error categorization complete'
      );

      // Step 3: Queue high-confidence fixes as pending operations (requires approval)
      let fixesQueuedThisIteration = 0;
      if (applyFixes && fixSuggestions.length > 0) {
        const highConfidenceFixes = fixSuggestions.filter((f) => f.confidence === 'high');

        // Instead of direct mutation, add fixes to pending operations for approval
        for (const fix of highConfidenceFixes) {
          const operationId = `auto-fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          session.pendingOperations.push({
            id: operationId,
            toolName: 'validate_self_correct',
            patches: [fix.patch],
            approvalTier: 2, // Medium tier for AI-generated fixes
            reason: fix.explanation,
            createdAt: new Date(),
          });
          fixesQueuedThisIteration++;
          totalFixesApplied++; // Count as "applied" for iteration tracking
          logger.debug({ path: fix.patch.path, operationId }, 'Queued fix for approval');
        }
      }

      // Collect all patches for user review
      allGeneratedPatches = allGeneratedPatches.concat(fixSuggestions.map((f) => f.patch));

      iterations.push({
        attempt,
        errorCount: errors.length,
        warningCount: validationResult.warnings.length,
        fixesGenerated: fixSuggestions.length,
        fixesApplied: fixesQueuedThisIteration,
        remainingErrors: unfixableErrors,
      });

      // If no fixes were generated or applied, stop iterating
      if (fixSuggestions.length === 0 || (!applyFixes && attempt === 1)) {
        // Without applyFixes, we just report what could be fixed
        break;
      }

      // If we queued no fixes this iteration, stop to avoid infinite loop
      if (applyFixes && fixesQueuedThisIteration === 0) {
        logger.warn('No fixes queued this iteration, stopping to avoid infinite loop');
        break;
      }
    }

    // Reached max retries or no more auto-fixable errors
    const lastIteration = iterations[iterations.length - 1];
    const hasRemainingErrors = lastIteration.remainingErrors.length > 0 || lastIteration.errorCount > 0;

    logger.info(
      {
        totalIterations: iterations.length,
        totalFixesApplied,
        remainingErrors: lastIteration.remainingErrors.length,
      },
      'Self-correcting loop completed'
    );

    // Escalate remaining errors
    const escalation = hasRemainingErrors
      ? {
          required: true,
          reason: 'Some errors could not be auto-fixed and require manual intervention',
          errors: lastIteration.remainingErrors.map((e) => ({
            path: e.path,
            message: e.message,
            suggestion: 'Review this error manually and provide the correct value',
          })),
        }
      : null;

    // Calculate pending operation count
    const pendingFixCount = session.pendingOperations.filter(
      (op) => op.toolName === 'validate_self_correct'
    ).length;

    return {
      success: true,
      data: {
        status: hasRemainingErrors ? 'partial' : 'valid',
        message: hasRemainingErrors
          ? `Completed ${iterations.length} iteration(s). ${lastIteration.remainingErrors.length} error(s) require manual intervention.`
          : applyFixes && pendingFixCount > 0
            ? `Generated ${pendingFixCount} fix(es) pending approval. Use edit_approve to apply them.`
            : `Document is valid after ${iterations.length} iteration(s).`,
        iterations,
        finalValid: !hasRemainingErrors && pendingFixCount === 0,
        allGeneratedPatches,
        totalFixesApplied,
        pendingApprovalCount: pendingFixCount,
        escalation,
        pendingPatches: applyFixes ? [] : allGeneratedPatches,
      },
    };
  },
};

export const validateTools: ToolDefinition[] = [
  validateFast,
  validateDeep,
  validateTemplate,
  autoFixErrors,
  getValidationSummary,
  selfCorrectingLoop,
];
