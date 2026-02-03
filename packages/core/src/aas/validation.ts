/**
 * Fast validation for AAS structures
 *
 * This provides quick structural validation in TypeScript.
 * For deep semantic validation, use the validation-service.
 */

import type { Environment } from './types.js';

export interface ValidationError {
  /** JSON Pointer path to the error location */
  path: string;
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  /** Whether the environment is valid */
  valid: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Validation warnings */
  warnings: ValidationError[];
}

/**
 * Validate an AAS Environment structure
 *
 * @param env - The environment to validate
 * @returns Validation result with errors and warnings
 */
export function validateEnvironment(env: Environment): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate AAS entries
  env.assetAdministrationShells?.forEach((aas, index) => {
    const basePath = `/assetAdministrationShells/${index}`;

    if (!aas.id) {
      errors.push({
        path: `${basePath}/id`,
        code: 'REQUIRED_FIELD',
        message: 'AssetAdministrationShell must have an id',
        severity: 'error',
      });
    }

    if (!aas.assetInformation) {
      errors.push({
        path: `${basePath}/assetInformation`,
        code: 'REQUIRED_FIELD',
        message: 'AssetAdministrationShell must have assetInformation',
        severity: 'error',
      });
    }
  });

  // Validate submodels
  env.submodels?.forEach((sm, index) => {
    const basePath = `/submodels/${index}`;

    if (!sm.id) {
      errors.push({
        path: `${basePath}/id`,
        code: 'REQUIRED_FIELD',
        message: 'Submodel must have an id',
        severity: 'error',
      });
    }

    if (!sm.semanticId) {
      warnings.push({
        path: `${basePath}/semanticId`,
        code: 'MISSING_SEMANTIC_ID',
        message: 'Submodel should have a semanticId for interoperability',
        severity: 'warning',
      });
    }

    // Validate submodel elements recursively
    sm.submodelElements?.forEach((sme, smeIndex) => {
      validateSubmodelElement(sme, `${basePath}/submodelElements/${smeIndex}`, errors, warnings);
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateSubmodelElement(
  sme: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  const element = sme as Record<string, unknown>;

  if (!element.modelType) {
    errors.push({
      path: `${path}/modelType`,
      code: 'REQUIRED_FIELD',
      message: 'SubmodelElement must have a modelType',
      severity: 'error',
    });
  }

  if (!element.idShort) {
    errors.push({
      path: `${path}/idShort`,
      code: 'REQUIRED_FIELD',
      message: 'SubmodelElement must have an idShort',
      severity: 'error',
    });
  }

  // Validate nested collections
  if (element.modelType === 'SubmodelElementCollection') {
    const value = element.value as unknown[] | undefined;
    value?.forEach((nested, i) => {
      validateSubmodelElement(nested, `${path}/value/${i}`, errors, warnings);
    });
  }

  // Validate property value types
  if (element.modelType === 'Property') {
    if (!element.valueType) {
      errors.push({
        path: `${path}/valueType`,
        code: 'REQUIRED_FIELD',
        message: 'Property must have a valueType',
        severity: 'error',
      });
    }
  }
}
