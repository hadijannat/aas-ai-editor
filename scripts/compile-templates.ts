#!/usr/bin/env npx tsx
/**
 * AASX AI Editor - Template Compiler
 *
 * Compiles IDTA submodel templates from source JSON into
 * optimized format with validation constraints.
 *
 * Usage: pnpm templates:compile
 */

import fs from 'node:fs';
import path from 'node:path';

interface TemplateRegistry {
  version: string;
  templates: TemplateEntry[];
}

interface TemplateEntry {
  id: string;
  name: string;
  version: string;
  semanticId: string;
  source: string;
  compiled: string;
  description: string;
  category: string;
  requiredElements: string[];
  optionalElements: string[];
}

interface CompiledTemplate {
  id: string;
  semanticId: string;
  version: string;
  constraints: TemplateConstraint[];
  defaultStructure: Record<string, unknown>;
  compiledAt: string;
}

interface TemplateConstraint {
  path: string;
  type: 'required' | 'optional' | 'pattern' | 'enum' | 'range';
  message: string;
  value?: unknown;
}

const TEMPLATES_DIR = path.resolve(__dirname, '../templates');
const SOURCES_DIR = path.join(TEMPLATES_DIR, 'sources');
const COMPILED_DIR = path.join(TEMPLATES_DIR, 'compiled');

async function main(): Promise<void> {
  console.log('AASX AI Editor - Template Compiler');
  console.log('===================================\n');

  // Ensure output directory exists
  if (!fs.existsSync(COMPILED_DIR)) {
    fs.mkdirSync(COMPILED_DIR, { recursive: true });
  }

  // Load registry
  const registryPath = path.join(TEMPLATES_DIR, 'registry.json');
  const registry: TemplateRegistry = JSON.parse(
    fs.readFileSync(registryPath, 'utf-8')
  );

  console.log(`Found ${registry.templates.length} templates in registry\n`);

  let compiled = 0;
  let skipped = 0;
  let errors = 0;

  for (const template of registry.templates) {
    const sourcePath = path.join(TEMPLATES_DIR, template.source);

    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
      console.log(`  [SKIP] ${template.id} - source file not found`);
      skipped++;
      continue;
    }

    try {
      console.log(`  [COMPILE] ${template.id}...`);

      // Read source template
      const source = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));

      // Generate compiled template
      const compiledTemplate: CompiledTemplate = {
        id: template.id,
        semanticId: template.semanticId,
        version: template.version,
        constraints: generateConstraints(template, source),
        defaultStructure: source,
        compiledAt: new Date().toISOString(),
      };

      // Write compiled output
      const outputPath = path.join(TEMPLATES_DIR, template.compiled);
      fs.writeFileSync(outputPath, JSON.stringify(compiledTemplate, null, 2));

      console.log(`           -> ${template.compiled}`);
      compiled++;
    } catch (error) {
      console.error(`  [ERROR] ${template.id}: ${error}`);
      errors++;
    }
  }

  console.log('\n===================================');
  console.log(`Compiled: ${compiled}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
}

function generateConstraints(
  template: TemplateEntry,
  _source: unknown
): TemplateConstraint[] {
  const constraints: TemplateConstraint[] = [];

  // Add required element constraints
  for (const element of template.requiredElements) {
    constraints.push({
      path: `/submodelElements/${element}`,
      type: 'required',
      message: `${element} is required for ${template.name}`,
    });
  }

  // Add optional element constraints (for documentation)
  for (const element of template.optionalElements) {
    constraints.push({
      path: `/submodelElements/${element}`,
      type: 'optional',
      message: `${element} is optional for ${template.name}`,
    });
  }

  // TODO: Parse source schema for additional constraints
  // - Value type constraints
  // - Pattern constraints (regex for specific formats)
  // - Enum constraints (allowed values)
  // - Range constraints (min/max for numbers)

  return constraints;
}

main().catch(console.error);
