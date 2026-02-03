/**
 * IDTA Template Types
 */

/**
 * Constraint types for template elements
 */
export type ConstraintType =
  | 'required'
  | 'optional'
  | 'cardinality'
  | 'valueRange'
  | 'enumeration'
  | 'pattern'
  | 'length';

/**
 * A constraint on a template element
 */
export interface TemplateConstraint {
  /** Constraint type */
  type: ConstraintType;

  /** Path to the affected element (relative to template root) */
  path: string;

  /** Constraint-specific parameters */
  params?: Record<string, unknown>;

  /** Human-readable description */
  description?: string;

  /** Whether this constraint can be auto-fixed by AI */
  autoFixable?: boolean;
}

/**
 * An IDTA template definition
 */
export interface Template {
  /** Template identifier (semantic ID) */
  id: string;

  /** Template name */
  name: string;

  /** Version */
  version: string;

  /** Description */
  description?: string;

  /** The template submodel structure */
  structure: TemplateStructure;

  /** Constraints on the structure */
  constraints: TemplateConstraint[];

  /** Source URL (e.g., IDTA repository) */
  sourceUrl?: string;

  /** Last updated */
  updatedAt?: string;
}

/**
 * Template structure (submodel skeleton)
 */
export interface TemplateStructure {
  /** Semantic ID for the submodel */
  semanticId: string;

  /** Required submodel elements */
  elements: TemplateElement[];
}

/**
 * A template element definition
 */
export interface TemplateElement {
  /** Element idShort */
  idShort: string;

  /** Semantic ID */
  semanticId?: string;

  /** Model type */
  modelType: string;

  /** Value type (for properties) */
  valueType?: string;

  /** Whether required */
  required?: boolean;

  /** Multiplicity (e.g., "1", "0..1", "1..*") */
  multiplicity?: string;

  /** Default value */
  defaultValue?: unknown;

  /** Allowed values (for enumerations) */
  allowedValues?: unknown[];

  /** Nested elements (for collections) */
  elements?: TemplateElement[];

  /** Description */
  description?: string;
}

/**
 * Compiled template for fast validation
 */
export interface CompiledTemplate {
  /** Original template ID */
  templateId: string;

  /** Compiled constraints as functions */
  validators: TemplateValidator[];

  /** Quick lookup of required paths */
  requiredPaths: Set<string>;

  /** Compiled at timestamp */
  compiledAt: string;
}

/**
 * A compiled validator function
 */
export interface TemplateValidator {
  /** Path this validator applies to */
  path: string;

  /** Constraint type */
  type: ConstraintType;

  /** Validate function */
  validate: (value: unknown) => ValidationCheckResult;
}

/**
 * Result of a single validation check
 */
export interface ValidationCheckResult {
  valid: boolean;
  message?: string;
}

/**
 * Registry of loaded templates
 */
export interface TemplateRegistry {
  /** Templates indexed by semantic ID */
  templates: Map<string, Template>;

  /** Compiled templates indexed by semantic ID */
  compiled: Map<string, CompiledTemplate>;

  /** When the registry was loaded */
  loadedAt: Date;
}
