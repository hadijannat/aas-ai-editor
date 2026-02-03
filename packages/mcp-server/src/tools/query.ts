/**
 * Query Tools
 *
 * Tools for navigating and querying AAS structures:
 * - Finding elements by semantic ID
 * - Selecting by path
 * - Listing submodels and elements
 */

import {
  selectSubmodelById,
  selectSubmodelBySemanticId,
  selectSmeByPath,
  getElementPath,
  calculateDiff,
  applyPatches,
  readAasx,
  type Environment,
  type Submodel,
  type SubmodelElement,
  type SubmodelElementCollection,
  type AasPatchOp,
  type DiffResult,
} from '@aas-ai-editor/core';
import type { ToolDefinition, ToolResult } from '../types.js';

/**
 * Undo entry stored on the undo stack (mirrors document.ts)
 */
interface UndoEntry {
  description: string;
  inversePatches: AasPatchOp[];
  originalPatches: AasPatchOp[];
}

/**
 * Get a summary of a submodel for listing
 */
function summarizeSubmodel(sm: Submodel) {
  return {
    id: sm.id,
    idShort: sm.idShort,
    semanticId: sm.semanticId?.keys?.[0]?.value,
    kind: sm.kind || 'Instance',
    elementCount: sm.submodelElements?.length || 0,
  };
}

/**
 * Get a summary of a submodel element for listing
 */
function summarizeElement(sme: SubmodelElement) {
  const base = {
    idShort: sme.idShort,
    modelType: sme.modelType,
    semanticId: sme.semanticId?.keys?.[0]?.value,
  };

  // Add type-specific fields
  switch (sme.modelType) {
    case 'Property':
      return { ...base, valueType: sme.valueType, value: sme.value };
    case 'MultiLanguageProperty':
      return { ...base, value: sme.value };
    case 'SubmodelElementCollection':
      return { ...base, childCount: sme.value?.length || 0 };
    case 'File':
      return { ...base, contentType: sme.contentType, value: sme.value };
    case 'Blob':
      return { ...base, contentType: sme.contentType };
    case 'ReferenceElement':
      return { ...base, value: sme.value };
    case 'Range':
      return { ...base, valueType: sme.valueType, min: sme.min, max: sme.max };
    default:
      return base;
  }
}

/**
 * List all submodels in the environment
 */
const listSubmodels: ToolDefinition = {
  name: 'query_list_submodels',
  description: 'List all submodels in the current document with their semantic IDs.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_params, context): Promise<ToolResult> => {
    const { session } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment;
    const submodels = (env.submodels || []).map(summarizeSubmodel);

    return {
      success: true,
      data: {
        count: submodels.length,
        submodels,
      },
    };
  },
};

/**
 * Find submodel by semantic ID
 */
const findBySemanticId: ToolDefinition = {
  name: 'query_find_by_semantic_id',
  description: 'Find a submodel or element by its semantic ID.',
  inputSchema: {
    type: 'object',
    properties: {
      semanticId: {
        type: 'string',
        description: 'The semantic ID to search for (e.g., IRDI or IRI)',
      },
    },
    required: ['semanticId'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { semanticId } = params as { semanticId: string };
    const { session } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment;

    // First, search in submodels
    const submodel = selectSubmodelBySemanticId(env, semanticId);
    if (submodel) {
      const submodelIndex = env.submodels?.indexOf(submodel) ?? -1;
      return {
        success: true,
        data: {
          found: true,
          type: 'Submodel',
          semanticId,
          jsonPointer: `/submodels/${submodelIndex}`,
          result: summarizeSubmodel(submodel),
        },
      };
    }

    // Then search in submodel elements (recursive search)
    for (let smIndex = 0; smIndex < (env.submodels?.length || 0); smIndex++) {
      const sm = env.submodels![smIndex];
      const elementResult = findElementBySemanticIdRecursive(
        sm.submodelElements || [],
        semanticId,
        `/submodels/${smIndex}/submodelElements`
      );
      if (elementResult) {
        return {
          success: true,
          data: {
            found: true,
            type: 'SubmodelElement',
            semanticId,
            jsonPointer: elementResult.path,
            parentSubmodel: { id: sm.id, idShort: sm.idShort },
            result: summarizeElement(elementResult.element),
          },
        };
      }
    }

    return {
      success: true,
      data: {
        found: false,
        semanticId,
        message: 'No element found with the specified semantic ID',
      },
    };
  },
};

/**
 * Recursively search for an element by semantic ID
 */
function findElementBySemanticIdRecursive(
  elements: SubmodelElement[],
  semanticId: string,
  basePath: string
): { element: SubmodelElement; path: string } | undefined {
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const elementPath = `${basePath}/${i}`;

    // Check if this element matches
    if (element.semanticId?.keys?.some((k) => k.value === semanticId)) {
      return { element, path: elementPath };
    }

    // Recurse into collections
    if (element.modelType === 'SubmodelElementCollection') {
      const collection = element as SubmodelElementCollection;
      if (collection.value) {
        const result = findElementBySemanticIdRecursive(
          collection.value,
          semanticId,
          `${elementPath}/value`
        );
        if (result) return result;
      }
    }
  }
  return undefined;
}

/**
 * Get element by path
 */
const getByPath: ToolDefinition = {
  name: 'query_get_by_path',
  description: 'Get a specific element using an idShort path (e.g., "ContactInformation.Street").',
  inputSchema: {
    type: 'object',
    properties: {
      submodelId: {
        type: 'string',
        description: 'The submodel ID or idShort',
      },
      path: {
        type: 'string',
        description: 'Dot-separated path of idShorts (e.g., "ContactInformation.Street")',
      },
    },
    required: ['submodelId', 'path'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { submodelId, path: elementPath } = params as { submodelId: string; path: string };
    const { session } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment;

    // Find the submodel by ID or idShort
    const submodel =
      selectSubmodelById(env, submodelId) ||
      env.submodels?.find((sm) => sm.idShort === submodelId);

    if (!submodel) {
      return {
        success: false,
        error: `Submodel not found: ${submodelId}`,
      };
    }

    // Get the element by path
    const element = selectSmeByPath(submodel, elementPath);

    if (!element) {
      return {
        success: true,
        data: {
          found: false,
          submodelId,
          path: elementPath,
          message: `Element not found at path: ${elementPath}`,
        },
      };
    }

    // Get the JSON Pointer path
    const jsonPointer = getElementPath(env, submodel.id, elementPath);

    return {
      success: true,
      data: {
        found: true,
        submodelId,
        path: elementPath,
        jsonPointer,
        element: summarizeElement(element),
      },
    };
  },
};

/**
 * List elements in a submodel or collection
 */
const listElements: ToolDefinition = {
  name: 'query_list_elements',
  description: 'List all submodel elements within a submodel or SubmodelElementCollection.',
  inputSchema: {
    type: 'object',
    properties: {
      submodelId: {
        type: 'string',
        description: 'The submodel ID or idShort',
      },
      collectionPath: {
        type: 'string',
        description: 'Optional path to a SubmodelElementCollection',
      },
    },
    required: ['submodelId'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { submodelId, collectionPath } = params as {
      submodelId: string;
      collectionPath?: string;
    };
    const { session } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment;

    // Find the submodel by ID or idShort
    const submodel =
      selectSubmodelById(env, submodelId) ||
      env.submodels?.find((sm) => sm.idShort === submodelId);

    if (!submodel) {
      return {
        success: false,
        error: `Submodel not found: ${submodelId}`,
      };
    }

    let elements: SubmodelElement[] | undefined;
    let parentPath = '';

    if (collectionPath) {
      // Navigate to the collection
      const collection = selectSmeByPath(submodel, collectionPath);
      if (!collection) {
        return {
          success: false,
          error: `Collection not found at path: ${collectionPath}`,
        };
      }
      if (collection.modelType !== 'SubmodelElementCollection') {
        return {
          success: false,
          error: `Element at path ${collectionPath} is not a SubmodelElementCollection (got ${collection.modelType})`,
        };
      }
      elements = (collection as SubmodelElementCollection).value;
      parentPath = collectionPath;
    } else {
      elements = submodel.submodelElements;
    }

    const elementSummaries = (elements || []).map((sme) => summarizeElement(sme));

    return {
      success: true,
      data: {
        submodelId,
        submodelIdShort: submodel.idShort,
        collectionPath: parentPath || undefined,
        count: elementSummaries.length,
        elements: elementSummaries,
      },
    };
  },
};

/**
 * Get JSON Pointer path for an element
 */
const getElementPointer: ToolDefinition = {
  name: 'query_get_pointer',
  description: 'Get the JSON Pointer path for an element (used for patch operations).',
  inputSchema: {
    type: 'object',
    properties: {
      submodelId: {
        type: 'string',
        description: 'The submodel ID',
      },
      elementPath: {
        type: 'string',
        description: 'Dot-separated idShort path to the element',
      },
    },
    required: ['submodelId', 'elementPath'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { submodelId, elementPath } = params as {
      submodelId: string;
      elementPath: string;
    };
    const { session } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const env = session.documentState.environment as Environment;

    // Resolve submodel ID if idShort was provided
    let resolvedSubmodelId = submodelId;
    const submodelByIdShort = env.submodels?.find((sm) => sm.idShort === submodelId);
    if (submodelByIdShort) {
      resolvedSubmodelId = submodelByIdShort.id;
    }

    // Get the JSON Pointer path
    const jsonPointer = getElementPath(env, resolvedSubmodelId, elementPath);

    if (!jsonPointer) {
      return {
        success: true,
        data: {
          found: false,
          submodelId,
          elementPath,
          message: 'Element not found - could not generate JSON Pointer',
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        submodelId,
        elementPath,
        jsonPointer,
        // Also provide the value path for convenience
        valuePath: `${jsonPointer}/value`,
      },
    };
  },
};

/**
 * Compare current document with a previous state or another file
 */
const queryDiff: ToolDefinition = {
  name: 'query_diff',
  description:
    'Compare the current document with a previous state (from undo stack) or another AASX/JSON file.',
  inputSchema: {
    type: 'object',
    properties: {
      compareWith: {
        type: 'string',
        enum: ['undo', 'file'],
        description:
          'What to compare with: "undo" = previous state from undo stack, "file" = provided base64 data',
      },
      fileContent: {
        type: 'string',
        description:
          'Base64-encoded AASX or JSON environment (required when compareWith="file")',
      },
      undoSteps: {
        type: 'number',
        description:
          'How many undo steps back to compare (default: 1, only when compareWith="undo")',
      },
    },
    required: ['compareWith'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { compareWith, fileContent, undoSteps = 1 } = params as {
      compareWith: 'undo' | 'file';
      fileContent?: string;
      undoSteps?: number;
    };
    const { session, logger } = context;

    if (!session.documentState?.environment) {
      return { success: false, error: 'No document loaded' };
    }

    const currentEnv = session.documentState.environment as Environment;
    let otherEnv: Environment;

    if (compareWith === 'undo') {
      // Get environment from undo stack by reconstructing previous state
      const undoStack = session.documentState.undoStack as UndoEntry[];
      if (!undoStack || undoStack.length < undoSteps) {
        return {
          success: false,
          error: `No undo state available at step ${undoSteps} (stack has ${undoStack?.length || 0} entries)`,
        };
      }

      // Reconstruct previous state by applying inverse patches
      // Start from current environment and apply the last N inverse patches
      let reconstructedEnv = structuredClone(currentEnv);

      for (let i = 0; i < undoSteps; i++) {
        const entry = undoStack[undoStack.length - 1 - i];
        const result = applyPatches(reconstructedEnv, entry.inversePatches);
        if (!result.success) {
          return {
            success: false,
            error: `Failed to reconstruct previous state at step ${i + 1}: ${result.error}`,
          };
        }
        reconstructedEnv = result.result as Environment;
      }

      otherEnv = reconstructedEnv;
      logger.info(
        { undoSteps, stackSize: undoStack.length },
        'Comparing with undo state'
      );
    } else {
      // Parse provided file
      if (!fileContent) {
        return {
          success: false,
          error: 'fileContent required when compareWith="file"',
        };
      }

      try {
        const buffer = Buffer.from(fileContent, 'base64');

        // Try to parse as AASX first, then as JSON
        try {
          const { environment } = await readAasx(buffer);
          otherEnv = environment;
          logger.info('Parsed file as AASX');
        } catch {
          // Try parsing as raw JSON environment
          const jsonString = buffer.toString('utf-8');
          otherEnv = JSON.parse(jsonString) as Environment;
          logger.info('Parsed file as JSON environment');
        }
      } catch (err) {
        return {
          success: false,
          error: `Failed to parse provided file: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Calculate diff - otherEnv is "before", currentEnv is "after"
    const diff: DiffResult = calculateDiff(otherEnv, currentEnv);

    return {
      success: true,
      data: {
        diff,
        summary: {
          changeCount: diff.changeCount,
          additions: diff.additions,
          removals: diff.removals,
          modifications: diff.modifications,
          identical: diff.identical,
        },
      },
    };
  },
};

export const queryTools: ToolDefinition[] = [
  listSubmodels,
  findBySemanticId,
  getByPath,
  listElements,
  getElementPointer,
  queryDiff,
];
