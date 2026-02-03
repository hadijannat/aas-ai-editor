/**
 * AASX Reader - Parse AASX packages to AAS Environment
 *
 * AASX files are OPC (Open Packaging Conventions) packages (ZIP files) containing:
 * - [Content_Types].xml: MIME type mappings
 * - _rels/.rels: Root relationships
 * - AAS JSON or XML file: The actual AAS Environment
 * - Supplementary files: Thumbnails, PDFs, etc.
 */

import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type {
  Environment,
  AssetAdministrationShell,
  Submodel,
  ConceptDescription,
  SubmodelElement,
  Reference,
  LangStringSet,
  AssetInformation,
  Key,
  KeyType,
  ValueType,
} from '../aas/types.js';
import {
  parseContentTypes,
  parseOpcRelationships,
  findAasSpecPath,
  getContentTypeForPath,
  isJsonContentType,
  isXmlContentType,
  OPC_RELATIONSHIP_TYPES,
  type ContentTypes,
  type OpcRelationship,
} from './opc.js';

export interface ReadAasxOptions {
  /** Validate the structure during read (default: true) */
  validate?: boolean;
  /** Maximum file size in bytes (default: 100MB) */
  maxSize?: number;
}

export interface ReadAasxResult {
  /** The parsed AAS Environment */
  environment: Environment;
  /** Original filename (from package if available) */
  filename: string;
  /** Additional files from the package (thumbnails, PDFs, etc.) */
  supplementaryFiles: Map<string, Uint8Array>;
  /** Warnings encountered during parsing (non-fatal issues) */
  warnings: string[];
}

/**
 * Read an AASX file and extract the AAS Environment
 *
 * @param data - The AASX file as ArrayBuffer or Uint8Array
 * @param options - Read options
 * @returns Parsed result with Environment and supplementary files
 *
 * @example
 * ```ts
 * const file = await fetch('example.aasx').then(r => r.arrayBuffer());
 * const { environment, warnings } = await readAasx(file);
 * if (warnings.length > 0) {
 *   console.warn('Parsing warnings:', warnings);
 * }
 * console.log(environment.assetAdministrationShells);
 * ```
 */
export async function readAasx(
  data: ArrayBuffer | Uint8Array,
  options: ReadAasxOptions = {}
): Promise<ReadAasxResult> {
  const { maxSize = 100 * 1024 * 1024 } = options;
  const warnings: string[] = [];

  // Convert to Uint8Array if needed
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  // Check size limit
  if (bytes.length > maxSize) {
    throw new Error(`AASX file exceeds maximum size of ${maxSize} bytes (got ${bytes.length} bytes)`);
  }

  // Unzip the package
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Failed to unzip AASX file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Parse [Content_Types].xml (optional but expected)
  let contentTypes: ContentTypes = { defaults: [], overrides: [] };
  const contentTypesXml = getFileContent(files, '[Content_Types].xml');
  if (contentTypesXml) {
    try {
      contentTypes = parseContentTypes(contentTypesXml);
    } catch {
      warnings.push('[Content_Types].xml could not be parsed; using fallback detection');
    }
  } else {
    warnings.push('[Content_Types].xml not found; using fallback detection');
  }

  // Parse root relationships (_rels/.rels)
  let rootRels: OpcRelationship[] = [];
  const relsXml = getFileContent(files, '_rels/.rels');
  if (relsXml) {
    try {
      rootRels = parseOpcRelationships(relsXml);
    } catch {
      warnings.push('_rels/.rels could not be parsed; searching for AAS files by extension');
    }
  } else {
    warnings.push('_rels/.rels not found; searching for AAS files by extension');
  }

  // Find the AAS specification file
  let aasPath = findAasSpecPath(rootRels);
  let aasFormat: 'json' | 'xml' | undefined;

  if (aasPath) {
    // Normalize path (remove leading slash or relative prefix)
    aasPath = normalizePath(aasPath);

    // Determine format from content type or extension
    const contentType = getContentTypeForPath(aasPath, contentTypes);
    if (contentType) {
      if (isJsonContentType(contentType)) {
        aasFormat = 'json';
      } else if (isXmlContentType(contentType)) {
        aasFormat = 'xml';
      }
    }

    // Fall back to extension-based detection
    if (!aasFormat) {
      aasFormat = detectFormatFromExtension(aasPath);
    }
  } else {
    // Fallback: search for AAS files by extension
    warnings.push('No aas-spec relationship found; searching for .json/.xml files');
    const found = findAasFileByExtension(files);
    if (found) {
      aasPath = found.path;
      aasFormat = found.format;
      warnings.push(`Found AAS file by extension: ${aasPath}`);
    }
  }

  if (!aasPath || !files[aasPath]) {
    throw new Error('No AAS specification file found in package');
  }

  // Parse the AAS Environment
  const aasContent = getFileContent(files, aasPath);
  if (!aasContent) {
    throw new Error(`AAS file "${aasPath}" could not be read`);
  }

  let environment: Environment;
  try {
    if (aasFormat === 'xml') {
      environment = parseAasXml(aasContent);
    } else {
      // Default to JSON
      environment = JSON.parse(aasContent);
    }
  } catch (error) {
    throw new Error(
      `Failed to parse AAS file "${aasPath}": ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate basic structure
  if (!environment || typeof environment !== 'object') {
    throw new Error('Parsed AAS Environment is not a valid object');
  }

  // Ensure arrays exist (lenient handling)
  environment.assetAdministrationShells ??= [];
  environment.submodels ??= [];
  environment.conceptDescriptions ??= [];

  // Collect supplementary files
  const supplementaryFiles = collectSupplementaryFiles(files, rootRels, aasPath, warnings);

  // Extract filename from aas path if available
  const filename = aasPath.split('/').pop() || 'aas.json';

  return {
    environment,
    filename,
    supplementaryFiles,
    warnings,
  };
}

/**
 * Get file content as string from the unzipped files
 */
function getFileContent(files: Record<string, Uint8Array>, path: string): string | undefined {
  const data = files[path];
  if (!data) {
    return undefined;
  }
  return new TextDecoder('utf-8').decode(data);
}

/**
 * Normalize OPC path (remove leading slash, handle relative paths)
 */
function normalizePath(path: string): string {
  // Remove leading slash
  let normalized = path.startsWith('/') ? path.slice(1) : path;

  // Handle relative paths like "./aasx/aas.json"
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

/**
 * Detect format from file extension
 */
function detectFormatFromExtension(path: string): 'json' | 'xml' | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'xml') return 'xml';
  return undefined;
}

/**
 * Search for AAS files by extension when relationships are missing
 */
function findAasFileByExtension(files: Record<string, Uint8Array>): { path: string; format: 'json' | 'xml' } | undefined {
  const paths = Object.keys(files);

  // Prefer JSON files in common locations
  const jsonCandidates = paths.filter(
    (p) => p.endsWith('.json') && !p.startsWith('_rels') && !p.includes('/.rels')
  );

  // Look for files with "aas" in the name first
  const aasJsonFile = jsonCandidates.find((p) => p.toLowerCase().includes('aas'));
  if (aasJsonFile) {
    return { path: aasJsonFile, format: 'json' };
  }

  // Fall back to any JSON file in aasx folder
  const aasxJsonFile = jsonCandidates.find((p) => p.startsWith('aasx/'));
  if (aasxJsonFile) {
    return { path: aasxJsonFile, format: 'json' };
  }

  // Try XML files
  const xmlCandidates = paths.filter(
    (p) => p.endsWith('.xml') && !p.startsWith('_rels') && !p.includes('/.rels') && p !== '[Content_Types].xml'
  );

  const aasXmlFile = xmlCandidates.find((p) => p.toLowerCase().includes('aas'));
  if (aasXmlFile) {
    return { path: aasXmlFile, format: 'xml' };
  }

  // Fall back to first JSON file
  if (jsonCandidates.length > 0) {
    return { path: jsonCandidates[0], format: 'json' };
  }

  // Fall back to first XML file
  if (xmlCandidates.length > 0) {
    return { path: xmlCandidates[0], format: 'xml' };
  }

  return undefined;
}

/**
 * Parse AAS XML format to Environment
 *
 * Note: This is a simplified parser. Full XML support would need
 * comprehensive mapping of all AAS XML elements.
 */
function parseAasXml(xml: string): Environment {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    // Handle arrays properly - NOTE: 'value' is NOT included here because it's
    // context-dependent (array for MLP/SEC, string for Property)
    isArray: (name) => {
      const arrayElements = [
        'assetAdministrationShells',
        'submodels',
        'conceptDescriptions',
        'submodelElements',
        'keys',
        'specificAssetIds',
        'langStringSet',
        'embeddedDataSpecifications',
      ];
      return arrayElements.includes(name);
    },
  });

  const result = parser.parse(xml);

  // The root element could be "environment" or "aas:environment" etc.
  const env = result.environment || result['aas:environment'] || result.Environment || result;

  return transformXmlToEnvironment(env);
}

/**
 * Transform parsed XML structure to Environment type
 * Handles the differences between XML and JSON representations
 */
function transformXmlToEnvironment(xmlEnv: Record<string, unknown>): Environment {
  const env: Environment = {
    assetAdministrationShells: [],
    submodels: [],
    conceptDescriptions: [],
  };

  // Handle assetAdministrationShells
  const shells = xmlEnv.assetAdministrationShells || xmlEnv['aas:assetAdministrationShells'];
  if (shells) {
    env.assetAdministrationShells = extractXmlArray(shells, 'assetAdministrationShell').map(transformAas);
  }

  // Handle submodels
  const submodels = xmlEnv.submodels || xmlEnv['aas:submodels'];
  if (submodels) {
    env.submodels = extractXmlArray(submodels, 'submodel').map(transformSubmodel);
  }

  // Handle conceptDescriptions
  const concepts = xmlEnv.conceptDescriptions || xmlEnv['aas:conceptDescriptions'];
  if (concepts) {
    env.conceptDescriptions = extractXmlArray(concepts, 'conceptDescription').map(transformConceptDescription);
  }

  return env;
}

/**
 * Extract array from XML structure that may be:
 * - Already an array of wrapper objects { childName: {...} }
 * - Already an array of direct objects
 * - A wrapper object with child element(s)
 * - A single object
 */
function extractXmlArray(value: unknown, childName: string): unknown[] {
  if (Array.isArray(value)) {
    // Each array item might be a wrapper object { childName: {...} }
    // or the actual item itself
    return value.flatMap((item) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const child = obj[childName] || obj[`aas:${childName}`];
        if (child) {
          return Array.isArray(child) ? child : [child];
        }
      }
      return [item];
    });
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Check for wrapped child elements
    const child = obj[childName] || obj[`aas:${childName}`];
    if (child) {
      return Array.isArray(child) ? child : [child];
    }
    // If no wrapper, treat the object itself as a single item
    return [value];
  }
  return [];
}

/**
 * Transform XML AAS to typed structure
 * Note: Simplified - a full implementation would handle all fields
 */
function transformAas(xmlAas: unknown): AssetAdministrationShell {
  const aas = xmlAas as Record<string, unknown>;
  return {
    modelType: 'AssetAdministrationShell',
    id: String(aas.id || aas['@_id'] || ''),
    idShort: aas.idShort as string | undefined,
    assetInformation: transformAssetInformation(aas.assetInformation),
    submodels: transformReferences(aas.submodels),
    derivedFrom: aas.derivedFrom ? transformReference(aas.derivedFrom) : undefined,
    description: transformLangStringSet(aas.description),
    administration: aas.administration as { version?: string; revision?: string } | undefined,
  };
}

function transformAssetInformation(xmlInfo: unknown): AssetInformation {
  if (!xmlInfo || typeof xmlInfo !== 'object') {
    return { assetKind: 'Instance' };
  }
  const info = xmlInfo as Record<string, unknown>;
  return {
    assetKind: (info.assetKind as 'Instance' | 'NotApplicable' | 'Type') || 'Instance',
    globalAssetId: info.globalAssetId as string | undefined,
  };
}

function transformSubmodel(xmlSubmodel: unknown): Submodel {
  const sm = xmlSubmodel as Record<string, unknown>;
  return {
    modelType: 'Submodel',
    id: String(sm.id || sm['@_id'] || ''),
    idShort: sm.idShort as string | undefined,
    semanticId: sm.semanticId ? transformReference(sm.semanticId) : undefined,
    submodelElements: transformSubmodelElements(sm.submodelElements),
    kind: sm.kind as 'Instance' | 'Template' | undefined,
    description: transformLangStringSet(sm.description),
    administration: sm.administration as { version?: string; revision?: string } | undefined,
  };
}

function transformConceptDescription(xmlCd: unknown): ConceptDescription {
  const cd = xmlCd as Record<string, unknown>;
  return {
    modelType: 'ConceptDescription',
    id: String(cd.id || cd['@_id'] || ''),
    idShort: cd.idShort as string | undefined,
    description: transformLangStringSet(cd.description),
    administration: cd.administration as { version?: string; revision?: string } | undefined,
  };
}

function transformReference(xmlRef: unknown): Reference | undefined {
  if (!xmlRef || typeof xmlRef !== 'object') return undefined;
  const ref = xmlRef as Record<string, unknown>;
  return {
    type: (ref.type as 'ExternalReference' | 'ModelReference') || 'ModelReference',
    keys: transformKeys(ref.keys),
  };
}

function transformReferences(xmlRefs: unknown): Reference[] | undefined {
  if (!xmlRefs) return undefined;
  if (Array.isArray(xmlRefs)) {
    // Handle array of wrapper objects [{ reference: {...} }, ...] or direct references
    return xmlRefs.map(item => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        // Check if this is a wrapper { reference: {...} }
        const inner = obj.reference || obj['aas:reference'];
        if (inner) {
          return transformReference(inner);
        }
      }
      return transformReference(item);
    }).filter(Boolean) as Reference[];
  }
  const refs = xmlRefs as Record<string, unknown>;
  const refArray = refs.reference || refs['aas:reference'];
  if (refArray) {
    // Handle both array and single reference
    const innerArray = Array.isArray(refArray) ? refArray : [refArray];
    return innerArray.map(r => transformReference(r)).filter(Boolean) as Reference[];
  }
  return undefined;
}

function transformKeys(xmlKeys: unknown): Key[] {
  if (!xmlKeys) return [];

  // Handle direct array of keys
  if (Array.isArray(xmlKeys)) {
    return xmlKeys.flatMap(item => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        // Check if this is a wrapper { key: {...} }
        const inner = obj.key || obj['aas:key'];
        if (inner) {
          const innerArray = Array.isArray(inner) ? inner : [inner];
          return innerArray.map(k => transformSingleKey(k));
        }
      }
      return [transformSingleKey(item)];
    });
  }

  // Handle wrapper object { key: [...] or {...} }
  const keys = xmlKeys as Record<string, unknown>;
  const keyArray = keys.key || keys['aas:key'];
  if (keyArray) {
    // Handle both array and single object
    const innerArray = Array.isArray(keyArray) ? keyArray : [keyArray];
    return innerArray.map(k => transformSingleKey(k));
  }

  return [];
}

/**
 * Transform a single key from various XML formats
 */
function transformSingleKey(k: unknown): Key {
  if (!k || typeof k !== 'object') {
    return { type: '' as KeyType, value: String(k || '') };
  }
  const obj = k as Record<string, unknown>;
  return {
    type: String(obj.type || obj['@_type'] || '') as KeyType,
    value: String(obj.value || obj['#text'] || ''),
  };
}

function transformLangStringSet(xmlLss: unknown): LangStringSet | undefined {
  if (!xmlLss) return undefined;

  // Handle direct array format - may contain wrapper objects or direct lang strings
  if (Array.isArray(xmlLss)) {
    return xmlLss.flatMap(item => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        // Check if this array item is a wrapper { langStringTextType: {...} }
        const inner = obj.langStringTextType || obj['aas:langStringTextType'];
        if (inner) {
          // Inner can be an array or single object
          const innerArray = Array.isArray(inner) ? inner : [inner];
          return innerArray.map(ls => transformSingleLangString(ls));
        }
      }
      // Direct lang string object
      return [transformSingleLangString(item)];
    });
  }

  // Handle wrapper object format { langStringTextType: [...] or {...} }
  if (typeof xmlLss === 'object') {
    const obj = xmlLss as Record<string, unknown>;
    const items = obj.langStringTextType || obj['aas:langStringTextType'];
    if (items) {
      // Handle both array and single object
      const innerArray = Array.isArray(items) ? items : [items];
      return innerArray.map(ls => transformSingleLangString(ls));
    }

    // Handle single lang string object without wrapper (e.g., { language: 'en', text: 'Hello' })
    if ('language' in obj || '@_language' in obj || 'text' in obj || '#text' in obj) {
      return [transformSingleLangString(obj)];
    }
  }

  return undefined;
}

/**
 * Transform a single lang string from various XML formats
 */
function transformSingleLangString(ls: unknown): { language: string; text: string } {
  if (!ls || typeof ls !== 'object') {
    return { language: '', text: String(ls || '') };
  }
  const obj = ls as Record<string, unknown>;
  return {
    language: String(obj.language || obj['@_language'] || ''),
    text: String(obj.text || obj['#text'] || ''),
  };
}

function transformSubmodelElements(xmlSmes: unknown): SubmodelElement[] | undefined {
  if (!xmlSmes) return undefined;
  if (Array.isArray(xmlSmes)) {
    // Handle array with possible nested structures
    // Case 1: [{ submodelElement: [{...}, {...}] }] - wrapper with array inside
    // Case 2: [{ submodelElement: {...} }, { submodelElement: {...} }] - array of single wrappers
    return xmlSmes.flatMap((item) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const inner = obj.submodelElement || obj['aas:submodelElement'];
        if (inner) {
          // Inner can be an array (multiple elements) or single object
          if (Array.isArray(inner)) {
            return inner.map(transformSubmodelElement);
          }
          return [transformSubmodelElement(inner)];
        }
      }
      return [transformSubmodelElement(item)];
    });
  }
  const smes = xmlSmes as Record<string, unknown>;
  // Handle wrapped array
  const smeArray = smes.submodelElement || smes['aas:submodelElement'];
  if (Array.isArray(smeArray)) {
    return smeArray.map(transformSubmodelElement);
  }
  // Handle single wrapped element
  if (smeArray) {
    return [transformSubmodelElement(smeArray)];
  }
  return undefined;
}

function transformSubmodelElement(xmlSme: unknown): SubmodelElement {
  const sme = xmlSme as Record<string, unknown>;
  const modelType = (sme.modelType || sme['@_modelType'] || 'Property') as string;

  const base = {
    idShort: sme.idShort as string | undefined,
    semanticId: sme.semanticId ? transformReference(sme.semanticId) : undefined,
    description: transformLangStringSet(sme.description),
  };

  switch (modelType) {
    case 'Property':
      return {
        ...base,
        modelType: 'Property' as const,
        valueType: ((sme.valueType as string) || 'xs:string') as ValueType,
        value: sme.value as string | undefined,
      };
    case 'SubmodelElementCollection':
      return {
        ...base,
        modelType: 'SubmodelElementCollection' as const,
        value: transformSubmodelElements(sme.value),
      };
    case 'MultiLanguageProperty':
      return {
        ...base,
        modelType: 'MultiLanguageProperty' as const,
        value: transformLangStringSet(sme.value),
      };
    case 'File':
      return {
        ...base,
        modelType: 'File' as const,
        contentType: (sme.contentType as string) || 'application/octet-stream',
        value: sme.value as string | undefined,
      };
    case 'Blob':
      return {
        ...base,
        modelType: 'Blob' as const,
        contentType: (sme.contentType as string) || 'application/octet-stream',
        value: sme.value as string | undefined,
      };
    case 'ReferenceElement':
      return {
        ...base,
        modelType: 'ReferenceElement' as const,
        value: sme.value ? transformReference(sme.value) : undefined,
      };
    case 'Range':
      return {
        ...base,
        modelType: 'Range' as const,
        valueType: ((sme.valueType as string) || 'xs:string') as ValueType,
        min: sme.min as string | undefined,
        max: sme.max as string | undefined,
      };
    default:
      // Default to Property for unknown types
      return {
        ...base,
        modelType: 'Property' as const,
        valueType: 'xs:string' as ValueType,
        value: sme.value as string | undefined,
      };
  }
}

/**
 * Collect supplementary files (thumbnails, PDFs, etc.)
 */
function collectSupplementaryFiles(
  files: Record<string, Uint8Array>,
  rootRels: OpcRelationship[],
  aasPath: string,
  warnings: string[]
): Map<string, Uint8Array> {
  const supplementary = new Map<string, Uint8Array>();

  // Get files from relationships
  for (const rel of rootRels) {
    if (rel.type === OPC_RELATIONSHIP_TYPES.SUPPLEMENTARY || rel.type === OPC_RELATIONSHIP_TYPES.THUMBNAIL) {
      const path = normalizePath(rel.target);
      if (files[path]) {
        supplementary.set(path, files[path]);
      } else {
        warnings.push(`Supplementary file not found: ${path}`);
      }
    }
  }

  // Also include any files not in standard OPC locations
  const excludePaths = new Set([
    '[Content_Types].xml',
    '_rels/.rels',
    aasPath,
  ]);

  for (const [path, data] of Object.entries(files)) {
    // Skip OPC metadata files
    if (
      excludePaths.has(path) ||
      path.endsWith('.rels') ||
      path.startsWith('_rels/')
    ) {
      continue;
    }

    // Skip if already added from relationships
    if (supplementary.has(path)) {
      continue;
    }

    // Include files in common supplementary locations
    if (
      path.startsWith('supplementary/') ||
      path.startsWith('aasx-suppl/') ||
      path.includes('/thumbnail') ||
      /\.(png|jpg|jpeg|gif|pdf|doc|docx)$/i.test(path)
    ) {
      supplementary.set(path, data);
    }
  }

  return supplementary;
}
