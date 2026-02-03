/**
 * MCP Resources Registration
 *
 * Exposes document state as MCP resources for AI context.
 */

import type { Environment, Submodel } from '@aas-ai-editor/core';
import { selectSubmodelById, selectSubmodelBySemanticId } from '@aas-ai-editor/core';
import type { TransportHandler } from '../transport/handler.js';
import type { ResourceDefinition, ResourceContent } from '../types.js';

/**
 * Built-in template definitions for the registry resource
 */
const TEMPLATE_REGISTRY = {
  version: '1.0.0',
  templates: [
    {
      id: 'idta-digital-nameplate',
      name: 'Digital Nameplate',
      version: '2.0',
      semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
      description: 'Digital nameplate for identification of assets',
      category: 'identification',
      requiredElements: ['ManufacturerName', 'ManufacturerProductDesignation', 'SerialNumber'],
      optionalElements: ['ManufacturerProductFamily', 'YearOfConstruction', 'DateOfManufacture'],
    },
    {
      id: 'idta-technical-data',
      name: 'Technical Data',
      version: '1.2',
      semanticId: 'https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2',
      description: 'Technical specifications and characteristics',
      category: 'technical',
      requiredElements: ['GeneralInformation', 'TechnicalProperties'],
      optionalElements: ['ProductClassifications', 'FurtherInformation'],
    },
    {
      id: 'idta-carbon-footprint',
      name: 'Carbon Footprint',
      version: '1.0',
      semanticId: 'https://admin-shell.io/idta/CarbonFootprint/CarbonFootprint/1/0',
      description: 'Product and transport carbon footprint information',
      category: 'sustainability',
      requiredElements: ['ProductCarbonFootprint'],
      optionalElements: ['TransportCarbonFootprint'],
    },
    {
      id: 'idta-handover-documentation',
      name: 'Handover Documentation',
      version: '1.2',
      semanticId: 'https://admin-shell.io/ZVEI/HandoverDocumentation/1/2',
      description: 'Documentation handover for assets',
      category: 'documentation',
      requiredElements: ['Document'],
      optionalElements: [],
    },
  ],
  categories: [
    { id: 'identification', name: 'Identification', description: 'Templates for asset identification' },
    { id: 'technical', name: 'Technical Data', description: 'Templates for technical specifications' },
    { id: 'sustainability', name: 'Sustainability', description: 'Templates for environmental data' },
    { id: 'documentation', name: 'Documentation', description: 'Templates for documentation management' },
  ],
};

/**
 * Validation status cache per session
 */
interface ValidationCache {
  lastChecked: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
}

const validationCache = new Map<string, ValidationCache>();

/**
 * Current document state resource
 */
const documentState: ResourceDefinition = {
  uri: 'aas://document/state',
  name: 'Document State',
  description: 'Current document state including environment and pending operations',
  mimeType: 'application/json',
  handler: async (_uri, context): Promise<ResourceContent> => {
    const { session } = context;

    const state = {
      loaded: !!session.documentState,
      documentId: session.documentId,
      filename: session.documentState?.filename,
      dirty: session.documentState?.dirty ?? false,
      pendingOperations: session.pendingOperations.length,
      canUndo: (session.documentState?.undoStack.length ?? 0) > 0,
      canRedo: (session.documentState?.redoStack.length ?? 0) > 0,
    };

    return {
      uri: 'aas://document/state',
      mimeType: 'application/json',
      content: JSON.stringify(state, null, 2),
    };
  },
};

/**
 * Current environment JSON
 */
const environmentJson: ResourceDefinition = {
  uri: 'aas://document/environment',
  name: 'AAS Environment',
  description: 'The current AAS Environment JSON structure',
  mimeType: 'application/json',
  handler: async (_uri, context): Promise<ResourceContent> => {
    const { session } = context;

    if (!session.documentState?.environment) {
      return {
        uri: 'aas://document/environment',
        mimeType: 'application/json',
        content: JSON.stringify({ error: 'No document loaded' }),
      };
    }

    return {
      uri: 'aas://document/environment',
      mimeType: 'application/json',
      content: JSON.stringify(session.documentState.environment, null, 2),
    };
  },
};

/**
 * Pending operations resource
 */
const pendingOperations: ResourceDefinition = {
  uri: 'aas://document/pending',
  name: 'Pending Operations',
  description: 'Operations awaiting user approval',
  mimeType: 'application/json',
  handler: async (_uri, context): Promise<ResourceContent> => {
    const { session } = context;

    return {
      uri: 'aas://document/pending',
      mimeType: 'application/json',
      content: JSON.stringify(session.pendingOperations, null, 2),
    };
  },
};

/**
 * Submodel by ID resource (pattern-matched)
 *
 * Supports multiple lookup methods:
 * - aas://submodel/{id} - lookup by submodel ID
 * - aas://submodel/semantic/{semanticId} - lookup by semantic ID
 * - aas://submodel/idshort/{idShort} - lookup by idShort
 */
const submodelById: ResourceDefinition = {
  uri: 'aas://submodel/*',
  name: 'Submodel by ID',
  description: 'Get a specific submodel by ID, semantic ID, or idShort',
  mimeType: 'application/json',
  handler: async (uri, context): Promise<ResourceContent> => {
    const { session } = context;

    if (!session.documentState?.environment) {
      return {
        uri,
        mimeType: 'application/json',
        content: JSON.stringify({ error: 'No document loaded' }),
      };
    }

    const env = session.documentState.environment as Environment;
    const path = uri.replace('aas://submodel/', '');

    let submodel: Submodel | undefined;
    let lookupMethod: string;

    // Check for different lookup patterns
    if (path.startsWith('semantic/')) {
      // Lookup by semantic ID
      const semanticId = decodeURIComponent(path.replace('semantic/', ''));
      submodel = selectSubmodelBySemanticId(env, semanticId);
      lookupMethod = 'semanticId';
    } else if (path.startsWith('idshort/')) {
      // Lookup by idShort
      const idShort = path.replace('idshort/', '');
      submodel = env.submodels?.find((sm) => sm.idShort === idShort);
      lookupMethod = 'idShort';
    } else {
      // Default: lookup by ID
      const submodelId = decodeURIComponent(path);
      submodel = selectSubmodelById(env, submodelId);
      lookupMethod = 'id';
    }

    if (!submodel) {
      return {
        uri,
        mimeType: 'application/json',
        content: JSON.stringify({
          found: false,
          lookupMethod,
          query: path,
          availableSubmodels: env.submodels?.map((sm) => ({
            id: sm.id,
            idShort: sm.idShort,
            semanticId: sm.semanticId?.keys?.[0]?.value,
          })) || [],
        }),
      };
    }

    // Return the found submodel with metadata
    const submodelIndex = env.submodels?.indexOf(submodel) ?? -1;

    return {
      uri,
      mimeType: 'application/json',
      content: JSON.stringify({
        found: true,
        lookupMethod,
        index: submodelIndex,
        path: `/submodels/${submodelIndex}`,
        submodel,
      }, null, 2),
    };
  },
};

/**
 * Perform fast structural validation on the environment
 */
function performFastValidation(env: Environment): ValidationCache {
  const errors: ValidationCache['errors'] = [];

  // Check for basic structural issues
  if (!env.submodels || env.submodels.length === 0) {
    errors.push({
      path: '/submodels',
      message: 'No submodels defined in environment',
      severity: 'warning',
    });
  }

  // Validate each submodel
  env.submodels?.forEach((sm, smIndex) => {
    const basePath = `/submodels/${smIndex}`;

    // Check required fields
    if (!sm.id) {
      errors.push({
        path: `${basePath}/id`,
        message: `Submodel at index ${smIndex} missing required 'id' field`,
        severity: 'error',
      });
    }

    // Check for semantic ID (recommended but not required)
    if (!sm.semanticId) {
      errors.push({
        path: `${basePath}/semanticId`,
        message: `Submodel "${sm.idShort || sm.id}" has no semanticId (recommended for template matching)`,
        severity: 'warning',
      });
    }

    // Validate submodel elements
    sm.submodelElements?.forEach((sme, smeIndex) => {
      const smePath = `${basePath}/submodelElements/${smeIndex}`;

      if (!sme.idShort) {
        errors.push({
          path: `${smePath}/idShort`,
          message: `SubmodelElement at index ${smeIndex} missing required 'idShort' field`,
          severity: 'error',
        });
      }

      // Check Property-specific validation
      if (sme.modelType === 'Property') {
        if (!sme.valueType) {
          errors.push({
            path: `${smePath}/valueType`,
            message: `Property "${sme.idShort}" missing 'valueType' field`,
            severity: 'warning',
          });
        }
      }
    });
  });

  // Validate AAS shells
  env.assetAdministrationShells?.forEach((aas, aasIndex) => {
    const basePath = `/assetAdministrationShells/${aasIndex}`;

    if (!aas.id) {
      errors.push({
        path: `${basePath}/id`,
        message: `AAS at index ${aasIndex} missing required 'id' field`,
        severity: 'error',
      });
    }

    if (!aas.assetInformation?.globalAssetId) {
      errors.push({
        path: `${basePath}/assetInformation/globalAssetId`,
        message: `AAS "${aas.idShort || aas.id}" missing globalAssetId`,
        severity: 'error',
      });
    }

    // Check for broken submodel references
    aas.submodels?.forEach((ref, refIndex) => {
      const refId = ref.keys?.[0]?.value;
      if (refId && !env.submodels?.some((sm) => sm.id === refId)) {
        errors.push({
          path: `${basePath}/submodels/${refIndex}`,
          message: `AAS "${aas.idShort || aas.id}" references non-existent submodel: ${refId}`,
          severity: 'error',
        });
      }
    });
  });

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;

  return {
    lastChecked: new Date().toISOString(),
    valid: errorCount === 0,
    errorCount,
    warningCount,
    errors,
  };
}

/**
 * Validation status resource
 */
const validationStatus: ResourceDefinition = {
  uri: 'aas://validation/status',
  name: 'Validation Status',
  description: 'Current validation status and errors',
  mimeType: 'application/json',
  handler: async (_uri, context): Promise<ResourceContent> => {
    const { session } = context;

    if (!session.documentState) {
      return {
        uri: 'aas://validation/status',
        mimeType: 'application/json',
        content: JSON.stringify({ valid: false, reason: 'No document loaded' }),
      };
    }

    const env = session.documentState.environment as Environment;
    const sessionId = session.id;

    // Check if we have a recent validation result (within 30 seconds)
    const cached = validationCache.get(sessionId);
    const now = Date.now();
    const cacheAge = cached ? now - new Date(cached.lastChecked).getTime() : Infinity;

    let result: ValidationCache;
    if (cached && cacheAge < 30000) {
      // Use cached result
      result = cached;
    } else {
      // Perform fresh validation
      result = performFastValidation(env);
      validationCache.set(sessionId, result);
    }

    return {
      uri: 'aas://validation/status',
      mimeType: 'application/json',
      content: JSON.stringify({
        ...result,
        cached: cacheAge < 30000,
        summary: {
          submodelCount: env.submodels?.length ?? 0,
          aasCount: env.assetAdministrationShells?.length ?? 0,
          conceptDescriptionCount: env.conceptDescriptions?.length ?? 0,
        },
      }, null, 2),
    };
  },
};

/**
 * Template registry resource
 */
const templateRegistry: ResourceDefinition = {
  uri: 'aas://templates/registry',
  name: 'Template Registry',
  description: 'Available IDTA templates',
  mimeType: 'application/json',
  handler: async (_uri, context): Promise<ResourceContent> => {
    const { session } = context;

    // If a document is loaded, also show which templates match existing submodels
    const env = session.documentState?.environment as Environment | undefined;
    const matchedTemplates: Array<{
      templateId: string;
      submodelId: string;
      submodelIdShort?: string;
    }> = [];

    if (env?.submodels) {
      for (const sm of env.submodels) {
        const smSemanticId = sm.semanticId?.keys?.[0]?.value;
        if (smSemanticId) {
          const matchedTemplate = TEMPLATE_REGISTRY.templates.find(
            (t) => t.semanticId === smSemanticId
          );
          if (matchedTemplate) {
            matchedTemplates.push({
              templateId: matchedTemplate.id,
              submodelId: sm.id,
              submodelIdShort: sm.idShort,
            });
          }
        }
      }
    }

    return {
      uri: 'aas://templates/registry',
      mimeType: 'application/json',
      content: JSON.stringify({
        ...TEMPLATE_REGISTRY,
        matchedTemplates: matchedTemplates.length > 0 ? matchedTemplates : undefined,
        documentLoaded: !!env,
      }, null, 2),
    };
  },
};

export const allResources: ResourceDefinition[] = [
  documentState,
  environmentJson,
  pendingOperations,
  submodelById,
  validationStatus,
  templateRegistry,
];

/**
 * Register all resources with the transport handler
 */
export function registerResources(handler: TransportHandler): void {
  for (const resource of allResources) {
    handler.registerResource(resource);
  }
}

/**
 * Clear validation cache for a session
 */
export function clearValidationCache(sessionId: string): void {
  validationCache.delete(sessionId);
}
