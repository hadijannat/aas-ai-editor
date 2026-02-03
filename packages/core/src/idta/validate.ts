/**
 * Template validation
 */

import type { Submodel } from '../aas/types.js';
import type { TemplateValidator } from './types.js';
import { getCompiledTemplate, getTemplate } from './registry.js';
import { compileTemplate } from './compiler.js';

/**
 * Result of template validation
 */
export interface TemplateValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Template ID used for validation */
  templateId: string;

  /** Validation errors */
  errors: TemplateValidationError[];

  /** Validation warnings */
  warnings: TemplateValidationError[];
}

/**
 * A template validation error
 */
export interface TemplateValidationError {
  /** Path to the error */
  path: string;

  /** Constraint type that failed */
  constraintType: string;

  /** Error message */
  message: string;

  /** Whether this can be auto-fixed */
  autoFixable: boolean;
}

/**
 * Validate a submodel against an IDTA template
 *
 * @param submodel - The submodel to validate
 * @param templateId - The template semantic ID (optional - uses submodel's semanticId if not provided)
 * @returns Validation result
 *
 * @example
 * ```ts
 * const result = validateAgainstTemplate(submodel);
 * if (!result.valid) {
 *   console.log('Template violations:', result.errors);
 * }
 * ```
 */
export function validateAgainstTemplate(
  submodel: Submodel,
  templateId?: string
): TemplateValidationResult {
  // Determine template ID
  const semanticId =
    templateId || submodel.semanticId?.keys?.[0]?.value;

  if (!semanticId) {
    return {
      valid: true,
      templateId: 'none',
      errors: [],
      warnings: [
        {
          path: '/semanticId',
          constraintType: 'template',
          message: 'No semantic ID - cannot validate against template',
          autoFixable: false,
        },
      ],
    };
  }

  // Get or compile template
  let compiled = getCompiledTemplate(semanticId);

  if (!compiled) {
    const template = getTemplate(semanticId);
    if (!template) {
      return {
        valid: true,
        templateId: semanticId,
        errors: [],
        warnings: [
          {
            path: '/',
            constraintType: 'template',
            message: `No template found for semantic ID: ${semanticId}`,
            autoFixable: false,
          },
        ],
      };
    }
    compiled = compileTemplate(template);
  }

  // Run validators
  const errors: TemplateValidationError[] = [];
  const warnings: TemplateValidationError[] = [];

  for (const validator of compiled.validators) {
    const value = getValueAtPath(submodel, validator.path);
    const result = validator.validate(value);

    if (!result.valid) {
      errors.push({
        path: validator.path,
        constraintType: validator.type,
        message: result.message || `Constraint violation: ${validator.type}`,
        autoFixable: isAutoFixable(validator),
      });
    }
  }

  // Check required paths
  for (const requiredPath of compiled.requiredPaths) {
    const value = getValueAtPath(submodel, requiredPath);
    if (value === undefined || value === null) {
      // Avoid duplicate errors if already caught by validator
      const alreadyReported = errors.some((e) => e.path === requiredPath);
      if (!alreadyReported) {
        errors.push({
          path: requiredPath,
          constraintType: 'required',
          message: `Required element missing: ${requiredPath}`,
          autoFixable: true,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    templateId: semanticId,
    errors,
    warnings,
  };
}

/**
 * Get value at a path within a submodel
 */
function getValueAtPath(submodel: Submodel, path: string): unknown {
  const parts = path.split('/').filter(Boolean);
  let current: unknown = submodel.submodelElements;

  for (const part of parts) {
    if (!current) return undefined;

    if (Array.isArray(current)) {
      // Find element by idShort
      const element = current.find(
        (e: { idShort?: string }) => e.idShort === part
      );
      if (!element) return undefined;
      current = element;
    } else if (typeof current === 'object') {
      const obj = current as Record<string, unknown>;
      if (part === 'value' && obj.modelType === 'SubmodelElementCollection') {
        current = obj.value;
      } else if (part === 'value' && obj.modelType === 'Property') {
        current = obj.value;
      } else {
        current = obj[part];
      }
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Determine if a constraint violation is auto-fixable
 */
function isAutoFixable(validator: TemplateValidator): boolean {
  switch (validator.type) {
    case 'required':
      return true; // Can add default value
    case 'enumeration':
      return true; // Can select from allowed values
    case 'valueRange':
      return true; // Can clamp to range
    case 'pattern':
      return false; // Hard to auto-fix patterns
    case 'cardinality':
      return true; // Can add/remove items
    default:
      return false;
  }
}
