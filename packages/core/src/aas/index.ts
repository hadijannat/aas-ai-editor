/**
 * AAS types and selectors
 */

// Core AAS types
export type {
  Environment,
  AssetAdministrationShell,
  Submodel,
  SubmodelElement,
  Property,
  SubmodelElementCollection,
  Reference,
  Key,
  SemanticId,
  ModelType,
} from './types.js';

// Selectors for navigating AAS structures
export {
  selectAasById,
  selectSubmodelById,
  selectSubmodelBySemanticId,
  selectSmeByIdShort,
  selectSmeByPath,
  getElementPath,
} from './selectors.js';

// Validation helpers
export { validateEnvironment, type ValidationResult, type ValidationError } from './validation.js';
