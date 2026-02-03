/**
 * Template compiler
 *
 * Compiles template constraints into fast validator functions.
 */

import type {
  Template,
  CompiledTemplate,
  TemplateValidator,
  TemplateConstraint,
  ValidationCheckResult,
} from './types.js';
import { storeCompiledTemplate } from './registry.js';

/**
 * Compile a template into fast validators
 *
 * @param template - The template to compile
 * @returns The compiled template
 */
export function compileTemplate(template: Template): CompiledTemplate {
  const validators: TemplateValidator[] = [];
  const requiredPaths = new Set<string>();

  // Compile each constraint
  for (const constraint of template.constraints) {
    const validator = compileConstraint(constraint);
    if (validator) {
      validators.push(validator);
    }

    // Track required paths
    if (constraint.type === 'required') {
      requiredPaths.add(constraint.path);
    }
  }

  // Also compile structure-based constraints
  compileStructureConstraints(template.structure.elements, '', validators, requiredPaths);

  const compiled: CompiledTemplate = {
    templateId: template.id,
    validators,
    requiredPaths,
    compiledAt: new Date().toISOString(),
  };

  // Store in registry
  storeCompiledTemplate(template.id, compiled);

  return compiled;
}

function compileConstraint(constraint: TemplateConstraint): TemplateValidator | null {
  switch (constraint.type) {
    case 'required':
      return {
        path: constraint.path,
        type: 'required',
        validate: (value) => ({
          valid: value !== undefined && value !== null,
          message: value === undefined ? `Required field missing: ${constraint.path}` : undefined,
        }),
      };

    case 'cardinality':
      return compileCardinalityConstraint(constraint);

    case 'valueRange':
      return compileRangeConstraint(constraint);

    case 'enumeration':
      return compileEnumConstraint(constraint);

    case 'pattern':
      return compilePatternConstraint(constraint);

    case 'length':
      return compileLengthConstraint(constraint);

    default:
      return null;
  }
}

function compileCardinalityConstraint(constraint: TemplateConstraint): TemplateValidator {
  const min = (constraint.params?.min as number) ?? 0;
  const max = (constraint.params?.max as number) ?? Infinity;

  return {
    path: constraint.path,
    type: 'cardinality',
    validate: (value): ValidationCheckResult => {
      if (!Array.isArray(value)) {
        return { valid: min === 0, message: 'Expected array' };
      }
      if (value.length < min) {
        return { valid: false, message: `Minimum ${min} items required, got ${value.length}` };
      }
      if (value.length > max) {
        return { valid: false, message: `Maximum ${max} items allowed, got ${value.length}` };
      }
      return { valid: true };
    },
  };
}

function compileRangeConstraint(constraint: TemplateConstraint): TemplateValidator {
  const min = constraint.params?.min as number | undefined;
  const max = constraint.params?.max as number | undefined;

  return {
    path: constraint.path,
    type: 'valueRange',
    validate: (value): ValidationCheckResult => {
      if (typeof value !== 'number' && typeof value !== 'string') {
        return { valid: true }; // Skip non-numeric values
      }
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: true }; // Skip non-numeric strings
      }
      if (min !== undefined && num < min) {
        return { valid: false, message: `Value ${num} below minimum ${min}` };
      }
      if (max !== undefined && num > max) {
        return { valid: false, message: `Value ${num} above maximum ${max}` };
      }
      return { valid: true };
    },
  };
}

function compileEnumConstraint(constraint: TemplateConstraint): TemplateValidator {
  const allowed = (constraint.params?.values as unknown[]) ?? [];

  return {
    path: constraint.path,
    type: 'enumeration',
    validate: (value): ValidationCheckResult => {
      if (value === undefined || value === null) {
        return { valid: true }; // Optional by default
      }
      if (!allowed.includes(value)) {
        return {
          valid: false,
          message: `Value "${value}" not in allowed values: ${allowed.join(', ')}`,
        };
      }
      return { valid: true };
    },
  };
}

function compilePatternConstraint(constraint: TemplateConstraint): TemplateValidator {
  const pattern = constraint.params?.pattern as string;
  const regex = new RegExp(pattern);

  return {
    path: constraint.path,
    type: 'pattern',
    validate: (value): ValidationCheckResult => {
      if (typeof value !== 'string') {
        return { valid: true }; // Skip non-strings
      }
      if (!regex.test(value)) {
        return { valid: false, message: `Value does not match pattern: ${pattern}` };
      }
      return { valid: true };
    },
  };
}

function compileLengthConstraint(constraint: TemplateConstraint): TemplateValidator {
  const min = (constraint.params?.min as number) ?? 0;
  const max = (constraint.params?.max as number) ?? Infinity;

  return {
    path: constraint.path,
    type: 'length',
    validate: (value): ValidationCheckResult => {
      if (typeof value !== 'string') {
        return { valid: true };
      }
      if (value.length < min) {
        return { valid: false, message: `String too short (min ${min})` };
      }
      if (value.length > max) {
        return { valid: false, message: `String too long (max ${max})` };
      }
      return { valid: true };
    },
  };
}

function compileStructureConstraints(
  elements: Template['structure']['elements'],
  basePath: string,
  validators: TemplateValidator[],
  requiredPaths: Set<string>
): void {
  for (const element of elements) {
    const path = basePath ? `${basePath}/${element.idShort}` : element.idShort;

    if (element.required) {
      requiredPaths.add(path);
      validators.push({
        path,
        type: 'required',
        validate: (value) => ({
          valid: value !== undefined && value !== null,
          message: value === undefined ? `Required element missing: ${element.idShort}` : undefined,
        }),
      });
    }

    // Compile nested elements
    if (element.elements) {
      compileStructureConstraints(element.elements, path, validators, requiredPaths);
    }
  }
}
