/**
 * OPC (Open Packaging Conventions) utilities for AASX packages
 *
 * OPC is the ZIP-based packaging format used by AASX (and DOCX, XLSX, etc.).
 * Key files:
 * - [Content_Types].xml: Maps file extensions/paths to MIME types
 * - _rels/.rels: Root relationships linking package parts
 * - <part>/_rels/<part>.rels: Part-specific relationships
 */

import { XMLParser } from 'fast-xml-parser';

/**
 * OPC relationship structure
 */
export interface OpcRelationship {
  id: string;
  type: string;
  target: string;
  targetMode?: 'Internal' | 'External';
}

/**
 * Content type override (specific path → MIME type)
 */
export interface ContentTypeOverride {
  partName: string;
  contentType: string;
}

/**
 * Content type default (extension → MIME type)
 */
export interface ContentTypeDefault {
  extension: string;
  contentType: string;
}

/**
 * Parsed [Content_Types].xml structure
 */
export interface ContentTypes {
  defaults: ContentTypeDefault[];
  overrides: ContentTypeOverride[];
}

/**
 * Known OPC relationship types for AASX
 */
export const OPC_RELATIONSHIP_TYPES = {
  /** AAS specification file (JSON or XML) */
  AAS_SPEC: 'http://admin-shell.io/aasx/relationships/aas-spec',
  /** Thumbnail image */
  THUMBNAIL: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail',
  /** Supplementary file */
  SUPPLEMENTARY: 'http://admin-shell.io/aasx/relationships/aas-suppl',
} as const;

/**
 * Known content types for AAS files
 */
export const AAS_CONTENT_TYPES = {
  JSON: 'application/json',
  XML: 'application/xml',
  AAS_JSON: 'application/asset-administration-shell-package+json',
  AAS_XML: 'application/asset-administration-shell-package+xml',
} as const;

// Shared parser configuration
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
};

/**
 * Parse [Content_Types].xml to extract MIME type mappings
 *
 * @param xml - The [Content_Types].xml content as string
 * @returns Parsed content types with defaults and overrides
 */
export function parseContentTypes(xml: string): ContentTypes {
  const parser = new XMLParser(parserOptions);
  const result = parser.parse(xml);

  const defaults: ContentTypeDefault[] = [];
  const overrides: ContentTypeOverride[] = [];

  const types = result.Types;
  if (!types) {
    return { defaults, overrides };
  }

  // Parse Default elements (extension → contentType)
  const defaultElements = normalizeToArray(types.Default);
  for (const def of defaultElements) {
    if (def['@_Extension'] && def['@_ContentType']) {
      defaults.push({
        extension: def['@_Extension'],
        contentType: def['@_ContentType'],
      });
    }
  }

  // Parse Override elements (partName → contentType)
  const overrideElements = normalizeToArray(types.Override);
  for (const ovr of overrideElements) {
    if (ovr['@_PartName'] && ovr['@_ContentType']) {
      overrides.push({
        partName: ovr['@_PartName'],
        contentType: ovr['@_ContentType'],
      });
    }
  }

  return { defaults, overrides };
}

/**
 * Parse OPC relationships XML (_rels/.rels or part-specific .rels)
 *
 * @param xml - The relationships XML content
 * @returns Array of parsed relationships
 */
export function parseOpcRelationships(xml: string): OpcRelationship[] {
  const parser = new XMLParser(parserOptions);
  const result = parser.parse(xml);

  const relationships: OpcRelationship[] = [];

  const rels = result.Relationships;
  if (!rels) {
    return relationships;
  }

  const relElements = normalizeToArray(rels.Relationship);
  for (const rel of relElements) {
    if (rel['@_Id'] && rel['@_Type'] && rel['@_Target']) {
      relationships.push({
        id: rel['@_Id'],
        type: rel['@_Type'],
        target: rel['@_Target'],
        targetMode: rel['@_TargetMode'] as 'Internal' | 'External' | undefined,
      });
    }
  }

  return relationships;
}

/**
 * Find the AAS specification file path from relationships
 *
 * @param relationships - Parsed root relationships
 * @returns Path to the AAS spec file, or undefined if not found
 */
export function findAasSpecPath(relationships: OpcRelationship[]): string | undefined {
  const aasRel = relationships.find((r) => r.type === OPC_RELATIONSHIP_TYPES.AAS_SPEC);
  return aasRel?.target;
}

/**
 * Determine if a content type indicates JSON format
 */
export function isJsonContentType(contentType: string): boolean {
  return (
    contentType === AAS_CONTENT_TYPES.JSON ||
    contentType === AAS_CONTENT_TYPES.AAS_JSON ||
    contentType.includes('json')
  );
}

/**
 * Determine if a content type indicates XML format
 */
export function isXmlContentType(contentType: string): boolean {
  return (
    contentType === AAS_CONTENT_TYPES.XML ||
    contentType === AAS_CONTENT_TYPES.AAS_XML ||
    contentType.includes('xml')
  );
}

/**
 * Get content type for a file path from parsed content types
 *
 * @param path - File path within the package (e.g., "/aasx/aas.json")
 * @param contentTypes - Parsed content types
 * @returns Content type string or undefined
 */
export function getContentTypeForPath(path: string, contentTypes: ContentTypes): string | undefined {
  // Normalize path to start with /
  const normalizedPath = path.startsWith('/') ? path : '/' + path;

  // Check overrides first (specific paths take precedence)
  const override = contentTypes.overrides.find((o) => o.partName === normalizedPath);
  if (override) {
    return override.contentType;
  }

  // Fall back to extension-based defaults
  const ext = normalizedPath.split('.').pop()?.toLowerCase();
  if (ext) {
    const def = contentTypes.defaults.find((d) => d.extension.toLowerCase() === ext);
    if (def) {
      return def.contentType;
    }
  }

  return undefined;
}

/**
 * Generate OPC relationships XML
 *
 * @param relationships - Relationships to serialize
 * @returns XML string
 */
export function generateOpcRelationships(relationships: OpcRelationship[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  ];

  for (const rel of relationships) {
    const targetMode = rel.targetMode ? ` TargetMode="${rel.targetMode}"` : '';
    lines.push(`  <Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"${targetMode}/>`);
  }

  lines.push('</Relationships>');
  return lines.join('\n');
}

/**
 * Generate [Content_Types].xml
 *
 * @param contentTypes - Content types to serialize
 * @returns XML string
 */
export function generateContentTypes(contentTypes: ContentTypes): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  ];

  for (const def of contentTypes.defaults) {
    lines.push(`  <Default Extension="${def.extension}" ContentType="${def.contentType}"/>`);
  }

  for (const ovr of contentTypes.overrides) {
    lines.push(`  <Override PartName="${ovr.partName}" ContentType="${ovr.contentType}"/>`);
  }

  lines.push('</Types>');
  return lines.join('\n');
}

/**
 * Helper to normalize XML elements that may be single item or array
 */
function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
