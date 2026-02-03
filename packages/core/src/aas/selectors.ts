/**
 * Selectors for navigating AAS structures
 *
 * These provide type-safe accessors for common navigation patterns.
 */

import type {
  Environment,
  AssetAdministrationShell,
  Submodel,
  SubmodelElement,
  SubmodelElementCollection,
} from './types.js';

/**
 * Select an AAS by its ID
 */
export function selectAasById(
  env: Environment,
  id: string
): AssetAdministrationShell | undefined {
  return env.assetAdministrationShells?.find((aas) => aas.id === id);
}

/**
 * Select a submodel by its ID
 */
export function selectSubmodelById(env: Environment, id: string): Submodel | undefined {
  return env.submodels?.find((sm) => sm.id === id);
}

/**
 * Select a submodel by its semantic ID
 *
 * @param env - The AAS Environment
 * @param semanticId - The semantic ID value to match
 * @returns The matching submodel or undefined
 *
 * @example
 * ```ts
 * const nameplate = selectSubmodelBySemanticId(
 *   env,
 *   'https://admin-shell.io/zvei/nameplate/2/0/Nameplate'
 * );
 * ```
 */
export function selectSubmodelBySemanticId(
  env: Environment,
  semanticId: string
): Submodel | undefined {
  return env.submodels?.find((sm) => sm.semanticId?.keys?.some((k) => k.value === semanticId));
}

/**
 * Select a submodel element by idShort within a submodel
 *
 * @param submodel - The submodel to search in
 * @param idShort - The idShort to find
 * @returns The matching element or undefined
 */
export function selectSmeByIdShort(
  submodel: Submodel,
  idShort: string
): SubmodelElement | undefined {
  return submodel.submodelElements?.find((sme) => sme.idShort === idShort);
}

/**
 * Select a submodel element by path (dot-separated idShorts)
 *
 * @param submodel - The submodel to search in
 * @param path - Dot-separated path like "TechnicalProperties.Weight"
 * @returns The matching element or undefined
 *
 * @example
 * ```ts
 * const weight = selectSmeByPath(submodel, 'TechnicalProperties.Weight');
 * ```
 */
export function selectSmeByPath(submodel: Submodel, path: string): SubmodelElement | undefined {
  const parts = path.split('.');
  let current: SubmodelElement[] | undefined = submodel.submodelElements;

  for (let i = 0; i < parts.length; i++) {
    if (!current) return undefined;

    const element = current.find((sme) => sme.idShort === parts[i]);
    if (!element) return undefined;

    // If this is the last part, return it
    if (i === parts.length - 1) {
      return element;
    }

    // Otherwise, descend into collection
    if (element.modelType === 'SubmodelElementCollection') {
      current = (element as SubmodelElementCollection).value;
    } else {
      return undefined; // Can't descend into non-collection
    }
  }

  return undefined;
}

/**
 * Get the JSON Pointer path to an element
 *
 * @param env - The environment
 * @param submodelId - The submodel ID
 * @param elementIdShortPath - Dot-separated idShort path
 * @returns JSON Pointer path like "/submodels/0/submodelElements/3"
 */
export function getElementPath(
  env: Environment,
  submodelId: string,
  elementIdShortPath: string
): string | undefined {
  const submodelIndex = env.submodels?.findIndex((sm) => sm.id === submodelId);
  if (submodelIndex === undefined || submodelIndex === -1) return undefined;

  const submodel = env.submodels![submodelIndex];
  const parts = elementIdShortPath.split('.');
  let basePath = `/submodels/${submodelIndex}/submodelElements`;
  let current: SubmodelElement[] | undefined = submodel.submodelElements;

  for (const part of parts) {
    if (!current) return undefined;

    const elementIndex = current.findIndex((sme) => sme.idShort === part);
    if (elementIndex === -1) return undefined;

    basePath += `/${elementIndex}`;

    const element = current[elementIndex];
    if (element.modelType === 'SubmodelElementCollection') {
      current = (element as SubmodelElementCollection).value;
      if (parts.indexOf(part) < parts.length - 1) {
        basePath += '/value';
      }
    } else {
      current = undefined;
    }
  }

  return basePath;
}
