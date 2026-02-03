/**
 * Template registry management
 */

import type { Template, TemplateRegistry, CompiledTemplate } from './types.js';

// Global registry instance
let globalRegistry: TemplateRegistry | null = null;

/**
 * Get the global template registry
 *
 * @returns The template registry (creates if not exists)
 */
export function getTemplateRegistry(): TemplateRegistry {
  if (!globalRegistry) {
    globalRegistry = {
      templates: new Map(),
      compiled: new Map(),
      loadedAt: new Date(),
    };
  }
  return globalRegistry;
}

/**
 * Load a template into the registry
 *
 * @param template - The template to load
 */
export function loadTemplate(template: Template): void {
  const registry = getTemplateRegistry();
  registry.templates.set(template.id, template);
}

/**
 * Load templates from a JSON file or object
 *
 * @param source - Template definitions
 */
export function loadTemplates(source: { templates: Template[] }): void {
  for (const template of source.templates) {
    loadTemplate(template);
  }
}

/**
 * Get a template by semantic ID
 *
 * @param semanticId - The semantic ID to look up
 * @returns The template or undefined
 */
export function getTemplate(semanticId: string): Template | undefined {
  return getTemplateRegistry().templates.get(semanticId);
}

/**
 * Get a compiled template by semantic ID
 *
 * @param semanticId - The semantic ID to look up
 * @returns The compiled template or undefined
 */
export function getCompiledTemplate(semanticId: string): CompiledTemplate | undefined {
  return getTemplateRegistry().compiled.get(semanticId);
}

/**
 * Store a compiled template
 *
 * @param semanticId - The semantic ID
 * @param compiled - The compiled template
 */
export function storeCompiledTemplate(semanticId: string, compiled: CompiledTemplate): void {
  getTemplateRegistry().compiled.set(semanticId, compiled);
}

/**
 * List all registered template IDs
 */
export function listTemplateIds(): string[] {
  return Array.from(getTemplateRegistry().templates.keys());
}

/**
 * Clear the registry (useful for testing)
 */
export function clearRegistry(): void {
  globalRegistry = null;
}

/**
 * Well-known IDTA template semantic IDs
 */
export const IDTA_TEMPLATES = {
  NAMEPLATE: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
  DIGITAL_NAMEPLATE: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate/DigitalNameplate',
  TECHNICAL_DATA: 'https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2',
  HANDOVER_DOCUMENTATION: 'https://admin-shell.io/zvei/DigitalTypeplate/Documentation/1/1',
  CONTACT_INFORMATION: 'https://admin-shell.io/zvei/nameplate/1/0/ContactInformations',
  CARBON_FOOTPRINT: 'https://admin-shell.io/idta/CarbonFootprint/ProductCarbonFootprint/0/9',
} as const;
