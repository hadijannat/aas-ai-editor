/**
 * IDTA template handling
 *
 * Load and work with IDTA submodel templates for guided content creation.
 */

export type {
  Template,
  TemplateConstraint,
  TemplateRegistry,
  CompiledTemplate,
} from './types.js';

export { loadTemplate, getTemplateRegistry } from './registry.js';
export { compileTemplate } from './compiler.js';
export { validateAgainstTemplate, type TemplateValidationResult } from './validate.js';
