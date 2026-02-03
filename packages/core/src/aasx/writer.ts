/**
 * AASX Writer - Write AAS Environment to AASX package
 *
 * Creates OPC (Open Packaging Conventions) packages containing:
 * - [Content_Types].xml: MIME type mappings
 * - _rels/.rels: Root relationships pointing to AAS spec and supplementary files
 * - AAS JSON or XML file: The serialized AAS Environment
 * - Supplementary files: Optional thumbnails, PDFs, etc.
 */

import { zipSync, strToU8 } from 'fflate';
import type { Zippable } from 'fflate';
import { XMLBuilder } from 'fast-xml-parser';
import type { Environment, SubmodelElement, Key } from '../aas/types.js';
import {
  generateContentTypes,
  generateOpcRelationships,
  OPC_RELATIONSHIP_TYPES,
  AAS_CONTENT_TYPES,
  type ContentTypes,
  type OpcRelationship,
} from './opc.js';

export interface WriteAasxOptions {
  /** Filename for the AAS content file within the package (default: 'aas.json') */
  filename?: string;
  /** Format for the AAS content (default: 'json') */
  format?: 'json' | 'xml';
  /** Supplementary files to include (path -> content) */
  supplementaryFiles?: Map<string, Uint8Array>;
  /** Compression level (0-9, default: 6) */
  compressionLevel?: number;
}

/**
 * Write an AAS Environment to AASX format
 *
 * @param environment - The AAS Environment to write
 * @param options - Write options
 * @returns The AASX file as Uint8Array
 *
 * @example
 * ```ts
 * const aasx = await writeAasx(environment);
 * // Save to file or send over network
 *
 * // With options
 * const aasx = await writeAasx(environment, {
 *   filename: 'my-model.json',
 *   supplementaryFiles: new Map([['images/logo.png', pngData]]),
 *   compressionLevel: 9,
 * });
 * ```
 */
export async function writeAasx(
  environment: Environment,
  options: WriteAasxOptions = {}
): Promise<Uint8Array> {
  const {
    filename = 'aas.json',
    format = 'json',
    supplementaryFiles = new Map(),
    compressionLevel = 6,
  } = options;

  // Validate compression level
  if (compressionLevel < 0 || compressionLevel > 9) {
    throw new Error(`Invalid compression level: ${compressionLevel}. Must be 0-9.`);
  }

  const files: Record<string, Uint8Array> = {};
  const aasPath = `aasx/${filename}`;

  // 1. Serialize Environment to JSON or XML
  const aasContent =
    format === 'xml' ? serializeEnvironmentToXml(environment) : JSON.stringify(environment, null, 2);
  files[aasPath] = strToU8(aasContent);

  // 2. Build content types for all files
  const contentTypes = buildContentTypes(aasPath, format, supplementaryFiles);
  files['[Content_Types].xml'] = strToU8(generateContentTypes(contentTypes));

  // 3. Build relationships (AAS spec + supplementary files)
  const relationships = buildRelationships(aasPath, supplementaryFiles);
  files['_rels/.rels'] = strToU8(generateOpcRelationships(relationships));

  // 4. Add supplementary files
  for (const [path, data] of supplementaryFiles) {
    // Normalize path (ensure it doesn't start with /)
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    files[normalizedPath] = data;
  }

  // 5. Zip everything with specified compression
  // Cast compression level to the specific union type fflate expects
  return zipSync(files as Zippable, { level: compressionLevel as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 });
}

/**
 * Build content types structure for the package
 */
function buildContentTypes(
  aasPath: string,
  format: 'json' | 'xml',
  supplementaryFiles: Map<string, Uint8Array>
): ContentTypes {
  const defaults: ContentTypes['defaults'] = [];
  const overrides: ContentTypes['overrides'] = [];

  // Track which extensions we've added
  const addedExtensions = new Set<string>();

  // Add default for the AAS file extension
  const aasExtension = format === 'xml' ? 'xml' : 'json';
  defaults.push({
    extension: aasExtension,
    contentType: format === 'xml' ? AAS_CONTENT_TYPES.XML : AAS_CONTENT_TYPES.JSON,
  });
  addedExtensions.add(aasExtension);

  // Add override for the specific AAS file path with AAS-specific content type
  overrides.push({
    partName: `/${aasPath}`,
    contentType: format === 'xml' ? AAS_CONTENT_TYPES.AAS_XML : AAS_CONTENT_TYPES.AAS_JSON,
  });

  // Add rels content type
  defaults.push({
    extension: 'rels',
    contentType: 'application/vnd.openxmlformats-package.relationships+xml',
  });
  addedExtensions.add('rels');

  // Add content types for supplementary files
  for (const [path] of supplementaryFiles) {
    const ext = getExtension(path);
    if (ext && !addedExtensions.has(ext)) {
      const contentType = getContentTypeForExtension(ext);
      if (contentType) {
        defaults.push({ extension: ext, contentType });
        addedExtensions.add(ext);
      }
    }
  }

  return { defaults, overrides };
}

/**
 * Build OPC relationships for the package
 */
function buildRelationships(
  aasPath: string,
  supplementaryFiles: Map<string, Uint8Array>
): OpcRelationship[] {
  const relationships: OpcRelationship[] = [];
  let relId = 1;

  // Primary relationship: AAS specification
  relationships.push({
    id: `rId${relId++}`,
    type: OPC_RELATIONSHIP_TYPES.AAS_SPEC,
    target: `/${aasPath}`,
  });

  // Add relationships for supplementary files
  for (const [path] of supplementaryFiles) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const ext = getExtension(path)?.toLowerCase();

    // Determine relationship type based on file type/location
    const isThumbnail =
      ext && ['png', 'jpg', 'jpeg', 'gif'].includes(ext) && path.toLowerCase().includes('thumbnail');

    relationships.push({
      id: `rId${relId++}`,
      type: isThumbnail ? OPC_RELATIONSHIP_TYPES.THUMBNAIL : OPC_RELATIONSHIP_TYPES.SUPPLEMENTARY,
      target: normalizedPath,
    });
  }

  return relationships;
}

/**
 * Get file extension from path
 */
function getExtension(path: string): string | undefined {
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() : undefined;
}

/**
 * Get MIME content type for a file extension
 */
function getContentTypeForExtension(ext: string): string | undefined {
  const mimeTypes: Record<string, string> = {
    // Images
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
    html: 'text/html',
    // Data formats
    json: 'application/json',
    xml: 'application/xml',
    // Other
    zip: 'application/zip',
    bin: 'application/octet-stream',
  };

  return mimeTypes[ext.toLowerCase()];
}

/**
 * Serialize AAS Environment to XML format
 *
 * Note: This is a simplified serializer. A full implementation would need
 * comprehensive handling of all AAS element types and namespaces.
 */
function serializeEnvironmentToXml(environment: Environment): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true,
  });

  // Build the XML structure following AAS 3.0 schema
  const xmlObj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    environment: {
      '@_xmlns': 'https://admin-shell.io/aas/3/0',
      assetAdministrationShells: buildXmlAssetAdministrationShells(environment.assetAdministrationShells),
      submodels: buildXmlSubmodels(environment.submodels),
      conceptDescriptions: buildXmlConceptDescriptions(environment.conceptDescriptions),
    },
  };

  return builder.build(xmlObj);
}

/**
 * Build XML structure for Asset Administration Shells
 */
function buildXmlAssetAdministrationShells(
  shells: Environment['assetAdministrationShells']
): Record<string, unknown> | undefined {
  if (!shells || shells.length === 0) return undefined;

  return {
    assetAdministrationShell: shells.map((shell) => ({
      id: shell.id,
      idShort: shell.idShort,
      assetInformation: {
        assetKind: shell.assetInformation.assetKind,
        globalAssetId: shell.assetInformation.globalAssetId,
      },
      submodels: shell.submodels
        ? {
            reference: shell.submodels.map((ref) => ({
              type: ref.type,
              keys: { key: ref.keys.map((k) => ({ type: k.type, '#text': k.value })) },
            })),
          }
        : undefined,
      description: buildXmlLangStringSet(shell.description),
      administration: shell.administration,
    })),
  };
}

/**
 * Build XML structure for Submodels
 */
function buildXmlSubmodels(submodels: Environment['submodels']): Record<string, unknown> | undefined {
  if (!submodels || submodels.length === 0) return undefined;

  return {
    submodel: submodels.map((sm) => ({
      id: sm.id,
      idShort: sm.idShort,
      kind: sm.kind,
      semanticId: sm.semanticId
        ? {
            type: sm.semanticId.type,
            keys: { key: sm.semanticId.keys.map((k) => ({ type: k.type, '#text': k.value })) },
          }
        : undefined,
      submodelElements: sm.submodelElements
        ? { submodelElement: sm.submodelElements.map(buildXmlSubmodelElement) }
        : undefined,
      description: buildXmlLangStringSet(sm.description),
      administration: sm.administration,
    })),
  };
}

/**
 * Build XML structure for a single Submodel Element
 */
function buildXmlSubmodelElement(sme: SubmodelElement): Record<string, unknown> {
  const base: Record<string, unknown> = {
    modelType: sme.modelType,
    idShort: sme.idShort,
    semanticId: sme.semanticId
      ? {
          type: sme.semanticId.type,
          keys: { key: sme.semanticId.keys.map((k: Key) => ({ type: k.type, '#text': k.value })) },
        }
      : undefined,
    description: buildXmlLangStringSet(sme.description),
  };

  switch (sme.modelType) {
    case 'Property':
      return { ...base, valueType: sme.valueType, value: sme.value };
    case 'MultiLanguageProperty':
      return { ...base, value: buildXmlLangStringSet(sme.value) };
    case 'File':
      return { ...base, contentType: sme.contentType, value: sme.value };
    case 'Blob':
      return { ...base, contentType: sme.contentType, value: sme.value };
    case 'ReferenceElement':
      return {
        ...base,
        value: sme.value
          ? {
              type: sme.value.type,
              keys: { key: sme.value.keys.map((k: Key) => ({ type: k.type, '#text': k.value })) },
            }
          : undefined,
      };
    case 'Range':
      return { ...base, valueType: sme.valueType, min: sme.min, max: sme.max };
    case 'SubmodelElementCollection':
      return {
        ...base,
        value: sme.value ? { submodelElement: sme.value.map(buildXmlSubmodelElement) } : undefined,
      };
    default:
      return base;
  }
}

/**
 * Build XML structure for Concept Descriptions
 */
function buildXmlConceptDescriptions(
  conceptDescriptions: Environment['conceptDescriptions']
): Record<string, unknown> | undefined {
  if (!conceptDescriptions || conceptDescriptions.length === 0) return undefined;

  return {
    conceptDescription: conceptDescriptions.map((cd) => ({
      id: cd.id,
      idShort: cd.idShort,
      description: buildXmlLangStringSet(cd.description),
      administration: cd.administration,
    })),
  };
}

/**
 * Build XML structure for LangStringSet
 */
function buildXmlLangStringSet(
  langStrings: Array<{ language: string; text: string }> | undefined
): Record<string, unknown> | undefined {
  if (!langStrings || langStrings.length === 0) return undefined;

  return {
    langStringTextType: langStrings.map((ls) => ({
      '@_language': ls.language,
      '#text': ls.text,
    })),
  };
}
