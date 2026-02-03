#!/usr/bin/env tsx
/**
 * Template Compilation Script
 *
 * Compiles IDTA template source files from templates/sources/ into
 * optimized constraint schemas in templates/compiled/.
 *
 * Usage:
 *   pnpm --filter @aas-ai-editor/core compile-templates
 *   pnpm templates:compile  (from root)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// Types matching the core library
interface TemplateElement {
  idShort: string;
  semanticId?: string;
  modelType: string;
  valueType?: string;
  required?: boolean;
  multiplicity?: string;
  defaultValue?: unknown;
  allowedValues?: unknown[];
  elements?: TemplateElement[];
  description?: string;
}

interface TemplateStructure {
  semanticId: string;
  elements: TemplateElement[];
}

interface TemplateConstraint {
  type: 'required' | 'optional' | 'cardinality' | 'valueRange' | 'enumeration' | 'pattern' | 'length';
  path: string;
  params?: Record<string, unknown>;
  description?: string;
  autoFixable?: boolean;
}

interface SourceTemplate {
  id: string;
  name: string;
  version: string;
  semanticId: string;
  description?: string;
  sourceUrl?: string;
  structure: TemplateStructure;
  constraints: TemplateConstraint[];
}

interface CompiledConstraint {
  type: string;
  path: string;
  params?: Record<string, unknown>;
  autoFixable: boolean;
}

interface CompiledTemplate {
  templateId: string;
  semanticId: string;
  name: string;
  version: string;
  requiredPaths: string[];
  constraints: CompiledConstraint[];
  structureHash: string;
  compiledAt: string;
  sourceFile: string;
}

interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  semanticId: string;
  source: string;
  compiled: string;
  description?: string;
  category: string;
  requiredElements: string[];
  optionalElements: string[];
}

interface Registry {
  $schema: string;
  version: string;
  description: string;
  templates: RegistryEntry[];
  categories: Array<{ id: string; name: string; description: string }>;
}

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_ROOT = join(__dirname, '..', '..', '..', 'templates');
const SOURCES_DIR = join(TEMPLATES_ROOT, 'sources');
const COMPILED_DIR = join(TEMPLATES_ROOT, 'compiled');
const REGISTRY_PATH = join(TEMPLATES_ROOT, 'registry.json');

function log(message: string): void {
  console.log(`[compile-templates] ${message}`);
}

function error(message: string): void {
  console.error(`[compile-templates] ERROR: ${message}`);
}

/**
 * Generate a simple hash for structure comparison
 */
function hashStructure(structure: TemplateStructure): string {
  const json = JSON.stringify(structure);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Extract required paths from structure recursively
 */
function extractRequiredPaths(elements: TemplateElement[], basePath: string = ''): string[] {
  const paths: string[] = [];

  for (const element of elements) {
    const currentPath = basePath ? `${basePath}/${element.idShort}` : element.idShort;

    if (element.required) {
      paths.push(currentPath);
    }

    if (element.elements) {
      paths.push(...extractRequiredPaths(element.elements, currentPath));
    }
  }

  return paths;
}

/**
 * Determine if a constraint is auto-fixable
 */
function isAutoFixable(constraint: TemplateConstraint): boolean {
  switch (constraint.type) {
    case 'required':
      return true; // Can add with default value
    case 'enumeration':
      return true; // Can select first allowed value
    case 'valueRange':
      return true; // Can clamp to range
    case 'cardinality':
      return true; // Can add/remove items
    case 'pattern':
      return false; // Hard to auto-generate matching values
    case 'length':
      return true; // Can truncate or pad
    case 'optional':
      return false; // No fix needed
    default:
      return false;
  }
}

/**
 * Compile a source template into optimized form
 */
function compileSourceTemplate(source: SourceTemplate, sourceFile: string): CompiledTemplate {
  // Extract required paths from structure
  const structureRequiredPaths = extractRequiredPaths(source.structure.elements);

  // Extract required paths from constraints
  const constraintRequiredPaths = source.constraints
    .filter((c) => c.type === 'required')
    .map((c) => c.path);

  // Merge and dedupe
  const requiredPaths = [...new Set([...structureRequiredPaths, ...constraintRequiredPaths])];

  // Compile constraints
  const compiledConstraints: CompiledConstraint[] = source.constraints.map((constraint) => ({
    type: constraint.type,
    path: constraint.path,
    params: constraint.params,
    autoFixable: constraint.autoFixable ?? isAutoFixable(constraint),
  }));

  return {
    templateId: source.id,
    semanticId: source.semanticId,
    name: source.name,
    version: source.version,
    requiredPaths,
    constraints: compiledConstraints,
    structureHash: hashStructure(source.structure),
    compiledAt: new Date().toISOString(),
    sourceFile: basename(sourceFile),
  };
}

/**
 * Extract required/optional elements for registry entry
 */
function extractElements(elements: TemplateElement[]): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];

  for (const element of elements) {
    if (element.required) {
      required.push(element.idShort);
    } else {
      optional.push(element.idShort);
    }
  }

  return { required, optional };
}

/**
 * Main compilation function
 */
function main(): void {
  log('Starting template compilation...');

  // Ensure directories exist
  if (!existsSync(SOURCES_DIR)) {
    mkdirSync(SOURCES_DIR, { recursive: true });
    log(`Created sources directory: ${SOURCES_DIR}`);
  }

  if (!existsSync(COMPILED_DIR)) {
    mkdirSync(COMPILED_DIR, { recursive: true });
    log(`Created compiled directory: ${COMPILED_DIR}`);
  }

  // Find all source templates
  const sourceFiles = readdirSync(SOURCES_DIR).filter(
    (f) => f.endsWith('.json') && !f.startsWith('.')
  );

  if (sourceFiles.length === 0) {
    log('No source templates found in templates/sources/');
    log('Creating sample template...');
    createSampleTemplate();
    sourceFiles.push('digital-nameplate-v2.json');
  }

  log(`Found ${sourceFiles.length} source template(s)`);

  // Load existing registry or create new one
  let registry: Registry;
  if (existsSync(REGISTRY_PATH)) {
    registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) as Registry;
  } else {
    registry = {
      $schema: './registry.schema.json',
      version: '1.0.0',
      description: 'IDTA Submodel Template Registry',
      templates: [],
      categories: [
        { id: 'identification', name: 'Identification', description: 'Templates for asset identification' },
        { id: 'technical', name: 'Technical Data', description: 'Templates for technical specifications' },
        { id: 'sustainability', name: 'Sustainability', description: 'Templates for environmental and sustainability data' },
        { id: 'documentation', name: 'Documentation', description: 'Templates for documentation management' },
      ],
    };
  }

  // Process each source template
  let compiled = 0;
  let failed = 0;

  for (const sourceFile of sourceFiles) {
    const sourcePath = join(SOURCES_DIR, sourceFile);
    const compiledFile = sourceFile.replace('.json', '.compiled.json');
    const compiledPath = join(COMPILED_DIR, compiledFile);

    try {
      log(`Compiling: ${sourceFile}`);

      // Read and parse source
      const sourceContent = readFileSync(sourcePath, 'utf-8');
      const source = JSON.parse(sourceContent) as SourceTemplate;

      // Compile
      const compiledTemplate = compileSourceTemplate(source, sourceFile);

      // Write compiled output
      writeFileSync(compiledPath, JSON.stringify(compiledTemplate, null, 2));
      log(`  -> ${compiledFile} (${compiledTemplate.constraints.length} constraints, ${compiledTemplate.requiredPaths.length} required paths)`);

      // Update registry entry
      const { required, optional } = extractElements(source.structure.elements);
      const existingIndex = registry.templates.findIndex((t) => t.id === source.id);
      const entry: RegistryEntry = {
        id: source.id,
        name: source.name,
        version: source.version,
        semanticId: source.semanticId,
        source: `sources/${sourceFile}`,
        compiled: `compiled/${compiledFile}`,
        description: source.description,
        category: detectCategory(source),
        requiredElements: required,
        optionalElements: optional,
      };

      if (existingIndex >= 0) {
        registry.templates[existingIndex] = entry;
      } else {
        registry.templates.push(entry);
      }

      compiled++;
    } catch (err) {
      error(`Failed to compile ${sourceFile}: ${err}`);
      failed++;
    }
  }

  // Write updated registry
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  log(`Updated registry with ${registry.templates.length} template(s)`);

  // Summary
  log('');
  log(`Compilation complete: ${compiled} succeeded, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Detect category from template content
 */
function detectCategory(source: SourceTemplate): string {
  const idLower = source.id.toLowerCase();
  const nameLower = source.name.toLowerCase();

  if (idLower.includes('nameplate') || nameLower.includes('nameplate') || nameLower.includes('identification')) {
    return 'identification';
  }
  if (idLower.includes('technical') || nameLower.includes('technical')) {
    return 'technical';
  }
  if (idLower.includes('carbon') || idLower.includes('footprint') || nameLower.includes('sustainability')) {
    return 'sustainability';
  }
  if (idLower.includes('documentation') || idLower.includes('handover')) {
    return 'documentation';
  }

  return 'technical'; // Default
}

/**
 * Create a sample Digital Nameplate template
 */
function createSampleTemplate(): void {
  const sampleTemplate: SourceTemplate = {
    id: 'idta-digital-nameplate',
    name: 'Digital Nameplate',
    version: '2.0',
    semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
    description: 'Digital nameplate for identification of assets according to IDTA 02006-2-0',
    sourceUrl: 'https://github.com/admin-shell-io/submodel-templates/tree/main/published/Digital%20nameplate',
    structure: {
      semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
      elements: [
        {
          idShort: 'ManufacturerName',
          semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/ManufacturerName',
          modelType: 'Property',
          valueType: 'xs:string',
          required: true,
          description: 'Legally valid designation of the natural or judicial person',
        },
        {
          idShort: 'ManufacturerProductDesignation',
          semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/ManufacturerProductDesignation',
          modelType: 'Property',
          valueType: 'xs:string',
          required: true,
          description: 'Product designation as given by the manufacturer',
        },
        {
          idShort: 'SerialNumber',
          semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/SerialNumber',
          modelType: 'Property',
          valueType: 'xs:string',
          required: true,
          description: 'Unique combination of numbers and letters for identification',
        },
        {
          idShort: 'ManufacturerProductFamily',
          semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/ManufacturerProductFamily',
          modelType: 'Property',
          valueType: 'xs:string',
          required: false,
          description: '2nd level of a 3 level manufacturer specific product hierarchy',
        },
        {
          idShort: 'YearOfConstruction',
          semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/YearOfConstruction',
          modelType: 'Property',
          valueType: 'xs:gYear',
          required: false,
          description: 'Year as completion date of object',
        },
        {
          idShort: 'DateOfManufacture',
          semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/DateOfManufacture',
          modelType: 'Property',
          valueType: 'xs:date',
          required: false,
          description: 'Date from which the production and / or development process is completed',
        },
        {
          idShort: 'ContactInformation',
          semanticId: 'https://admin-shell.io/zvei/nameplate/1/0/ContactInformations/ContactInformation',
          modelType: 'SubmodelElementCollection',
          required: false,
          description: 'Contact information of the manufacturer',
          elements: [
            {
              idShort: 'Street',
              modelType: 'Property',
              valueType: 'xs:string',
              required: false,
            },
            {
              idShort: 'City',
              modelType: 'Property',
              valueType: 'xs:string',
              required: false,
            },
            {
              idShort: 'Country',
              modelType: 'Property',
              valueType: 'xs:string',
              required: false,
            },
            {
              idShort: 'Email',
              modelType: 'Property',
              valueType: 'xs:string',
              required: false,
            },
          ],
        },
      ],
    },
    constraints: [
      {
        type: 'required',
        path: 'ManufacturerName',
        description: 'Manufacturer name is mandatory',
        autoFixable: true,
      },
      {
        type: 'required',
        path: 'ManufacturerProductDesignation',
        description: 'Product designation is mandatory',
        autoFixable: true,
      },
      {
        type: 'required',
        path: 'SerialNumber',
        description: 'Serial number is mandatory',
        autoFixable: true,
      },
      {
        type: 'pattern',
        path: 'YearOfConstruction',
        params: { pattern: '^[0-9]{4}$' },
        description: 'Year must be 4 digits',
        autoFixable: false,
      },
      {
        type: 'pattern',
        path: 'DateOfManufacture',
        params: { pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
        description: 'Date must be in ISO format (YYYY-MM-DD)',
        autoFixable: false,
      },
      {
        type: 'pattern',
        path: 'ContactInformation/Email',
        params: { pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        description: 'Email must be valid format',
        autoFixable: false,
      },
    ],
  };

  const samplePath = join(SOURCES_DIR, 'digital-nameplate-v2.json');
  writeFileSync(samplePath, JSON.stringify(sampleTemplate, null, 2));
  log(`Created sample template: ${samplePath}`);
}

// Run
main();
