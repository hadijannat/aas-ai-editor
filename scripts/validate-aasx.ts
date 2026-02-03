#!/usr/bin/env npx tsx
/**
 * AASX AI Editor - CLI Validation Tool
 *
 * Validates AASX or JSON files from the command line.
 *
 * Usage:
 *   pnpm validate <file>
 *   pnpm validate --schema-only <file>
 *   pnpm validate --deep <file>
 */

import fs from 'node:fs';
import path from 'node:path';

interface ValidationResult {
  valid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  info: ValidationMessage[];
  duration_ms: number;
}

interface ValidationMessage {
  path: string;
  message: string;
  severity: string;
  rule: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const schemaOnly = args.includes('--schema-only');
  const deep = args.includes('--deep');
  const filePath = args.filter((a) => !a.startsWith('--'))[0];

  if (!filePath) {
    console.error('Error: No file specified');
    printUsage();
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  console.log('AASX AI Editor - Validation Tool');
  console.log('=================================\n');
  console.log(`File: ${absolutePath}`);
  console.log(`Mode: ${schemaOnly ? 'Schema Only' : deep ? 'Deep Validation' : 'Standard'}\n`);

  try {
    const result = await validateFile(absolutePath, { schemaOnly, deep });
    printResult(result);

    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    console.error(`Validation error: ${error}`);
    process.exit(2);
  }
}

function printUsage(): void {
  console.log(`
AASX AI Editor - Validation Tool

Usage:
  pnpm validate <file>              Validate with standard rules
  pnpm validate --schema-only <file>  Validate JSON Schema only
  pnpm validate --deep <file>       Run deep validation (slower)

Options:
  --schema-only   Only validate against AAS JSON Schema
  --deep          Use aas-test-engines for comprehensive validation
  --help, -h      Show this help message

Supported file types:
  .json           AAS Environment JSON
  .aasx           AAS Package (AASX/ZIP)
`);
}

async function validateFile(
  filePath: string,
  options: { schemaOnly?: boolean; deep?: boolean }
): Promise<ValidationResult> {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath);

  // TODO: Implement actual validation
  // This is a stub that performs basic checks

  const startTime = Date.now();
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const info: ValidationMessage[] = [];

  if (ext === '.json') {
    try {
      const json = JSON.parse(content.toString('utf-8'));
      validateJsonStructure(json, errors, warnings, info);
    } catch (e) {
      errors.push({
        path: '/',
        message: `Invalid JSON: ${e}`,
        severity: 'error',
        rule: 'schema.json',
      });
    }
  } else if (ext === '.aasx') {
    // TODO: Parse AASX package
    info.push({
      path: '/',
      message: 'AASX parsing not yet implemented in CLI tool',
      severity: 'info',
      rule: 'cli.feature',
    });
  } else {
    errors.push({
      path: '/',
      message: `Unsupported file type: ${ext}`,
      severity: 'error',
      rule: 'cli.filetype',
    });
  }

  if (options.deep && !options.schemaOnly) {
    // TODO: Call validation service for deep validation
    info.push({
      path: '/',
      message: 'Deep validation requires running validation-service',
      severity: 'info',
      rule: 'cli.feature',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
    duration_ms: Date.now() - startTime,
  };
}

function validateJsonStructure(
  json: unknown,
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
  _info: ValidationMessage[]
): void {
  if (typeof json !== 'object' || json === null) {
    errors.push({
      path: '/',
      message: 'Root must be an object',
      severity: 'error',
      rule: 'schema.structure',
    });
    return;
  }

  const env = json as Record<string, unknown>;

  // Check for expected arrays
  if (!Array.isArray(env.assetAdministrationShells)) {
    warnings.push({
      path: '/assetAdministrationShells',
      message: 'Missing or invalid assetAdministrationShells array',
      severity: 'warning',
      rule: 'schema.structure',
    });
  }

  if (!Array.isArray(env.submodels)) {
    warnings.push({
      path: '/submodels',
      message: 'Missing or invalid submodels array',
      severity: 'warning',
      rule: 'schema.structure',
    });
  }

  // Check submodels for semantic IDs
  const submodels = (env.submodels as unknown[]) || [];
  submodels.forEach((sm, i) => {
    if (typeof sm === 'object' && sm !== null) {
      const submodel = sm as Record<string, unknown>;
      if (!submodel.semanticId) {
        warnings.push({
          path: `/submodels/${i}`,
          message: 'Submodel missing semanticId',
          severity: 'warning',
          rule: 'semantics.semantic_id',
        });
      }
    }
  });
}

function printResult(result: ValidationResult): void {
  const icon = result.valid ? '✓' : '✗';
  const status = result.valid ? 'VALID' : 'INVALID';

  console.log(`Result: ${icon} ${status} (${result.duration_ms}ms)\n`);

  if (result.errors.length > 0) {
    console.log(`Errors (${result.errors.length}):`);
    result.errors.forEach((e) => {
      console.log(`  ✗ [${e.rule}] ${e.path}: ${e.message}`);
    });
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log(`Warnings (${result.warnings.length}):`);
    result.warnings.forEach((w) => {
      console.log(`  ⚠ [${w.rule}] ${w.path}: ${w.message}`);
    });
    console.log('');
  }

  if (result.info.length > 0) {
    console.log(`Info (${result.info.length}):`);
    result.info.forEach((i) => {
      console.log(`  ℹ [${i.rule}] ${i.path}: ${i.message}`);
    });
    console.log('');
  }
}

main().catch(console.error);
