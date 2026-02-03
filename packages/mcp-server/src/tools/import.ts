/**
 * Import Tools
 *
 * Tools for importing data into AAS structures:
 * - PDF datasheet extraction
 * - CSV/Excel mapping
 * - Image OCR
 * - Existing AAS merge
 * - Template-based generation
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import * as XLSX from 'xlsx';
// pdfjs-dist is loaded dynamically to avoid browser API errors in Node.js
// import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { Submodel, SubmodelElement, Environment, Reference, Key } from '@aas-ai-editor/core';
import { readAasx, calculateDiff } from '@aas-ai-editor/core';
import type { ToolDefinition, ToolResult } from '../types.js';
import { createPathValidator } from '../security/paths.js';

/**
 * Template metadata from registry
 */
interface TemplateMetadata {
  id: string;
  name: string;
  version: string;
  semanticId: string;
  description?: string;
  category?: string;
  requiredElements: string[];
  optionalElements: string[];
}

/**
 * Template registry structure
 */
interface TemplateRegistry {
  templates: TemplateMetadata[];
}

/**
 * Built-in template definitions
 * In production, these would be loaded from templates/registry.json
 */
const TEMPLATE_REGISTRY: TemplateRegistry = {
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
};

/**
 * Find a template by ID or semantic ID
 */
function findTemplate(templateId: string): TemplateMetadata | undefined {
  return TEMPLATE_REGISTRY.templates.find(
    (t) =>
      t.id === templateId ||
      t.semanticId === templateId ||
      t.name.toLowerCase() === templateId.toLowerCase()
  );
}

/**
 * Create a semantic reference
 */
function createSemanticId(value: string): Reference {
  return {
    type: 'ExternalReference',
    keys: [{ type: 'GlobalReference', value } as Key],
  };
}

/**
 * Generate a submodel element (Property or SubmodelElementCollection)
 */
function generateElement(
  idShort: string,
  baseSemanticId: string,
  prefillData?: Record<string, unknown>
): SubmodelElement {
  const value = prefillData?.[idShort];
  const semanticIdValue = `${baseSemanticId}/${idShort}`;

  // Determine if this is a collection-type element (usually contains nested data)
  const collectionElements = [
    'GeneralInformation',
    'TechnicalProperties',
    'ProductClassifications',
    'FurtherInformation',
    'ProductCarbonFootprint',
    'TransportCarbonFootprint',
    'Document',
    'ContactInformation',
  ];

  if (collectionElements.includes(idShort)) {
    return {
      modelType: 'SubmodelElementCollection',
      idShort,
      semanticId: createSemanticId(semanticIdValue),
      value: [],
    } as SubmodelElement;
  }

  // Default to Property
  return {
    modelType: 'Property',
    idShort,
    semanticId: createSemanticId(semanticIdValue),
    valueType: 'xs:string',
    value: value !== undefined ? String(value) : '',
  } as SubmodelElement;
}

/**
 * Generate a complete submodel from a template
 */
function generateSubmodelFromTemplate(
  template: TemplateMetadata,
  prefillData?: Record<string, unknown>,
  includeOptional = false
): Submodel {
  const timestamp = Date.now();
  const submodel: Submodel = {
    modelType: 'Submodel',
    id: `urn:example:submodel:${template.id}:${timestamp}`,
    idShort: template.name.replace(/\s+/g, ''),
    semanticId: createSemanticId(template.semanticId),
    submodelElements: [],
  };

  // Add required elements
  for (const elementIdShort of template.requiredElements) {
    const element = generateElement(elementIdShort, template.semanticId, prefillData);
    submodel.submodelElements!.push(element);
  }

  // Add optional elements if requested or if prefill data exists for them
  if (includeOptional) {
    for (const elementIdShort of template.optionalElements) {
      const element = generateElement(elementIdShort, template.semanticId, prefillData);
      submodel.submodelElements!.push(element);
    }
  } else if (prefillData) {
    // Add optional elements that have prefill data
    for (const elementIdShort of template.optionalElements) {
      if (prefillData[elementIdShort] !== undefined) {
        const element = generateElement(elementIdShort, template.semanticId, prefillData);
        submodel.submodelElements!.push(element);
      }
    }
  }

  return submodel;
}

/**
 * Extract text content from a PDF file
 */
async function extractPdfText(pdfBuffer: Buffer, pages?: number[]): Promise<{ pages: Array<{ pageNumber: number; text: string }> }> {
  // Dynamic import to avoid browser API errors at startup
  // Note: pdfjs-dist requires the legacy build for Node.js environments
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '';

  const data = new Uint8Array(pdfBuffer);
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const result: Array<{ pageNumber: number; text: string }> = [];
  const totalPages = pdf.numPages;

  // Determine which pages to process
  const pagesToProcess = pages && pages.length > 0
    ? pages.filter(p => p >= 1 && p <= totalPages)
    : Array.from({ length: totalPages }, (_, i) => i + 1);

  for (const pageNum of pagesToProcess) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Combine text items into a single string
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    result.push({ pageNumber: pageNum, text });
  }

  return { pages: result };
}

/**
 * Parse structured data from extracted text (simple heuristic extraction)
 */
function parseExtractedFields(text: string, targetFields?: string[]): Record<string, string> {
  const fields: Record<string, string> = {};

  // Common field patterns in technical datasheets
  const patterns: Record<string, RegExp[]> = {
    ManufacturerName: [
      /manufacturer[:\s]+([^\n,]+)/i,
      /company[:\s]+([^\n,]+)/i,
      /made by[:\s]+([^\n,]+)/i,
    ],
    SerialNumber: [
      /serial(?:\s+number)?[:\s#]+([A-Z0-9-]+)/i,
      /s\/n[:\s]+([A-Z0-9-]+)/i,
      /sn[:\s]+([A-Z0-9-]+)/i,
    ],
    ManufacturerProductDesignation: [
      /product(?:\s+name)?[:\s]+([^\n]+)/i,
      /model(?:\s+name)?[:\s]+([^\n]+)/i,
      /designation[:\s]+([^\n]+)/i,
    ],
    YearOfConstruction: [
      /year(?:\s+of\s+(?:construction|manufacture))?[:\s]+(\d{4})/i,
      /manufactured[:\s]+(\d{4})/i,
      /built[:\s]+(\d{4})/i,
    ],
    DateOfManufacture: [
      /date(?:\s+of\s+manufacture)?[:\s]+(\d{4}-\d{2}-\d{2})/i,
      /manufactured[:\s]+(\d{4}-\d{2}-\d{2})/i,
    ],
    Weight: [
      /weight[:\s]+([0-9.]+\s*(?:kg|g|lb|oz))/i,
      /mass[:\s]+([0-9.]+\s*(?:kg|g|lb|oz))/i,
    ],
    Dimensions: [
      /dimensions?[:\s]+([0-9.]+\s*x\s*[0-9.]+(?:\s*x\s*[0-9.]+)?)/i,
      /size[:\s]+([0-9.]+\s*x\s*[0-9.]+(?:\s*x\s*[0-9.]+)?)/i,
    ],
    Voltage: [
      /voltage[:\s]+([0-9.]+\s*V(?:AC|DC)?)/i,
      /input[:\s]+([0-9.]+\s*V(?:AC|DC)?)/i,
    ],
    Power: [
      /power[:\s]+([0-9.]+\s*(?:W|kW|mW))/i,
      /wattage[:\s]+([0-9.]+\s*(?:W|kW|mW))/i,
    ],
  };

  // Filter to target fields if specified
  const fieldsToExtract = targetFields || Object.keys(patterns);

  for (const fieldName of fieldsToExtract) {
    const fieldPatterns = patterns[fieldName];
    if (!fieldPatterns) continue;

    for (const pattern of fieldPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        fields[fieldName] = match[1].trim();
        break;
      }
    }
  }

  return fields;
}

/**
 * Extract data from PDF datasheet
 */
const importPdf: ToolDefinition = {
  name: 'import_pdf',
  description:
    'Extract structured data from a PDF datasheet. Returns suggested property values for AAS submodel elements.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the PDF file',
      },
      base64Content: {
        type: 'string',
        description: 'Base64-encoded PDF content (alternative to filePath)',
      },
      targetSubmodel: {
        type: 'string',
        description: 'Target submodel semanticId or idShort to map extracted data',
      },
      pages: {
        type: 'array',
        items: { type: 'number' },
        description: 'Specific pages to process (1-indexed, optional, defaults to all)',
      },
      targetFields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific fields to look for (e.g., ["SerialNumber", "ManufacturerName"])',
      },
    },
    required: [],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { filePath, base64Content, targetSubmodel, pages, targetFields } = params as {
      filePath?: string;
      base64Content?: string;
      targetSubmodel?: string;
      pages?: number[];
      targetFields?: string[];
    };
    const { logger, session } = context;

    logger.info({ filePath, targetSubmodel, pages }, 'Importing PDF');

    // Check if targetSubmodel is specified but no document is loaded
    if (targetSubmodel && !session.documentState?.environment) {
      return {
        success: false,
        error: 'targetSubmodel specified but no document loaded. Load a document first or omit targetSubmodel for standalone extraction.',
      };
    }

    try {
      // Get PDF buffer
      let pdfBuffer: Buffer;
      if (base64Content) {
        pdfBuffer = Buffer.from(base64Content, 'base64');
      } else if (filePath) {
        // Validate path for security (prevent path traversal)
        const pathValidator = createPathValidator();
        const pathValidation = pathValidator.validate(filePath);
        if (!pathValidation.valid) {
          logger.warn({ path: filePath, error: pathValidation.error }, 'Path validation failed');
          return { success: false, error: pathValidation.error };
        }
        pdfBuffer = await readFile(pathValidation.normalizedPath!);
      } else {
        return { success: false, error: 'Either filePath or base64Content is required' };
      }

      // Extract text from PDF
      const extracted = await extractPdfText(pdfBuffer, pages);

      // Combine all page text
      const fullText = extracted.pages.map(p => p.text).join('\n');

      // Parse structured fields
      const extractedFields = parseExtractedFields(fullText, targetFields);

      // Generate patches - use full JSON Pointer paths if targetSubmodel is specified and document is loaded
      let submodelIndex = -1;
      let submodel: Submodel | undefined;

      if (targetSubmodel && session.documentState?.environment) {
        const env = session.documentState.environment as Environment;
        submodelIndex = env.submodels?.findIndex(
          sm => sm.idShort === targetSubmodel ||
                sm.id === targetSubmodel ||
                sm.semanticId?.keys?.[0]?.value === targetSubmodel
        ) ?? -1;
        if (submodelIndex >= 0) {
          submodel = env.submodels?.[submodelIndex];
        }
      }

      // Generate patches with correct JSON Pointer paths (using element indices, not idShorts)
      const suggestedPatches = Object.entries(extractedFields).map(([field, value]) => {
        let path: string;
        let op: 'replace' | 'add' = 'replace';

        if (submodel && submodelIndex >= 0) {
          // Find the element index by idShort
          const elementIndex = submodel.submodelElements?.findIndex(el => el.idShort === field) ?? -1;
          if (elementIndex >= 0) {
            // Element exists - generate replace patch with correct index
            path = `/submodels/${submodelIndex}/submodelElements/${elementIndex}/value`;
          } else {
            // Element doesn't exist - generate add patch for new Property
            op = 'add';
            path = `/submodels/${submodelIndex}/submodelElements/-`;
            return {
              op,
              path,
              value: {
                modelType: 'Property',
                idShort: field,
                valueType: 'xs:string',
                value,
              },
              confidence: 0.6, // Lower confidence for new elements
            };
          }
        } else {
          // No submodel context - use idShort path (caller needs to resolve)
          path = `/${field}/value`;
        }

        return {
          op,
          path,
          value,
          confidence: 0.7, // Heuristic extraction has moderate confidence
        };
      });

      return {
        success: true,
        data: {
          pageCount: extracted.pages.length,
          extractedFields,
          rawText: fullText.substring(0, 2000) + (fullText.length > 2000 ? '...' : ''),
          suggestedPatches,
          confidence: Object.keys(extractedFields).length > 0 ? 0.7 : 0.3,
          message: `Extracted ${Object.keys(extractedFields).length} fields from ${extracted.pages.length} page(s)`,
        },
      };
    } catch (err) {
      logger.error({ err }, 'PDF import failed');
      return {
        success: false,
        error: `PDF import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Parse spreadsheet data
 */
interface SpreadsheetRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

function parseSpreadsheet(
  buffer: Buffer,
  _extension: string,
  headerRow: number,
  mapping?: Record<string, string>
): { headers: string[]; rows: SpreadsheetRow[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON with header detection
  const rawData = XLSX.utils.sheet_to_json(sheet, {
    header: 1, // Return array of arrays first
    defval: '',
  }) as unknown[][];

  if (rawData.length < headerRow) {
    return { headers: [], rows: [] };
  }

  // Get headers from specified row (1-indexed)
  const headerRowData = rawData[headerRow - 1] as string[];
  const headers = headerRowData.map((h, i) => String(h || `Column${i + 1}`));

  // Apply mapping if provided
  const mappedHeaders = mapping
    ? headers.map((h) => {
        // Check both column letter (A, B, C) and header value
        const colLetter = String.fromCharCode(65 + headers.indexOf(h));
        return mapping[colLetter] || mapping[h] || h;
      })
    : headers;

  // Parse data rows
  const rows: SpreadsheetRow[] = [];
  for (let i = headerRow; i < rawData.length; i++) {
    const rowData = rawData[i] as unknown[];
    if (!rowData || rowData.every(cell => cell === '' || cell === null || cell === undefined)) {
      continue; // Skip empty rows
    }

    const data: Record<string, unknown> = {};
    for (let j = 0; j < mappedHeaders.length; j++) {
      const value = rowData[j];
      if (value !== '' && value !== null && value !== undefined) {
        data[mappedHeaders[j]] = value;
      }
    }

    if (Object.keys(data).length > 0) {
      rows.push({ rowNumber: i + 1, data });
    }
  }

  return { headers: mappedHeaders, rows };
}

/**
 * Import from CSV/Excel
 */
const importSpreadsheet: ToolDefinition = {
  name: 'import_spreadsheet',
  description: 'Import data from CSV or Excel file with column mapping. Supports .csv, .xlsx, .xls formats.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to CSV or Excel file',
      },
      base64Content: {
        type: 'string',
        description: 'Base64-encoded file content (alternative to filePath)',
      },
      fileType: {
        type: 'string',
        enum: ['csv', 'xlsx', 'xls'],
        description: 'File type (required if using base64Content)',
      },
      mapping: {
        type: 'object',
        description: 'Column to property mapping. Keys can be column letters (A, B) or header names. Values are AAS property idShorts.',
      },
      headerRow: {
        type: 'number',
        description: 'Row number containing headers (1-indexed, default: 1)',
      },
      templateId: {
        type: 'string',
        description: 'IDTA template ID to generate submodels for each row',
      },
    },
    required: [],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { filePath, base64Content, fileType, mapping, headerRow = 1, templateId } = params as {
      filePath?: string;
      base64Content?: string;
      fileType?: string;
      mapping?: Record<string, string>;
      headerRow?: number;
      templateId?: string;
    };
    const { logger } = context;

    logger.info({ filePath, headerRow, templateId }, 'Importing spreadsheet');

    try {
      // Get file buffer and extension
      let buffer: Buffer;
      let extension: string;

      if (base64Content) {
        buffer = Buffer.from(base64Content, 'base64');
        extension = fileType || 'xlsx';
      } else if (filePath) {
        // Validate path for security (prevent path traversal)
        const pathValidator = createPathValidator();
        const pathValidation = pathValidator.validate(filePath);
        if (!pathValidation.valid) {
          logger.warn({ path: filePath, error: pathValidation.error }, 'Path validation failed');
          return { success: false, error: pathValidation.error };
        }
        buffer = await readFile(pathValidation.normalizedPath!);
        extension = extname(pathValidation.normalizedPath!).toLowerCase().replace('.', '');
      } else {
        return { success: false, error: 'Either filePath or base64Content is required' };
      }

      // Parse spreadsheet
      const { headers, rows } = parseSpreadsheet(buffer, extension, headerRow, mapping);

      if (rows.length === 0) {
        return {
          success: true,
          data: {
            headers,
            rowCount: 0,
            suggestedPatches: [],
            message: 'No data rows found in spreadsheet',
          },
        };
      }

      // Generate patches for each row
      const suggestedPatches: Array<{
        op: 'add';
        path: string;
        value: Submodel | Record<string, unknown>;
        rowSource: number;
      }> = [];

      // If a template is specified, generate submodels for each row
      if (templateId) {
        const template = findTemplate(templateId);
        if (template) {
          for (const row of rows) {
            const submodel = generateSubmodelFromTemplate(
              template,
              row.data as Record<string, unknown>,
              false
            );
            suggestedPatches.push({
              op: 'add',
              path: '/submodels/-',
              value: submodel,
              rowSource: row.rowNumber,
            });
          }
        }
      } else {
        // Generate simple value patches
        for (const row of rows) {
          for (const [field, value] of Object.entries(row.data)) {
            suggestedPatches.push({
              op: 'add',
              path: `/${field}`,
              value: value as Record<string, unknown>,
              rowSource: row.rowNumber,
            });
          }
        }
      }

      return {
        success: true,
        data: {
          headers,
          rowCount: rows.length,
          sampleRows: rows.slice(0, 5),
          mapping: mapping || 'auto-detected from headers',
          suggestedPatches: suggestedPatches.slice(0, 100), // Limit for large files
          message: `Parsed ${rows.length} row(s) with ${headers.length} column(s)`,
        },
      };
    } catch (err) {
      logger.error({ err }, 'Spreadsheet import failed');
      return {
        success: false,
        error: `Spreadsheet import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Extract text from image using pattern matching (placeholder for vision API)
 */
const importImage: ToolDefinition = {
  name: 'import_image',
  description: 'Extract text from an image (nameplate photo, label, etc.). Note: Full OCR requires Claude vision API integration.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the image file',
      },
      base64Content: {
        type: 'string',
        description: 'Base64-encoded image content (alternative to filePath)',
      },
      mimeType: {
        type: 'string',
        description: 'Image MIME type (required if using base64Content)',
      },
      targetFields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific fields to look for (e.g., ["SerialNumber", "ManufacturerName"])',
      },
    },
    required: [],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { filePath, base64Content, mimeType, targetFields } = params as {
      filePath?: string;
      base64Content?: string;
      mimeType?: string;
      targetFields?: string[];
    };
    const { logger } = context;

    logger.info({ filePath, targetFields }, 'Importing image');

    try {
      // Get image data
      let imageBase64: string;
      let imageMimeType: string;

      if (base64Content) {
        imageBase64 = base64Content;
        imageMimeType = mimeType || 'image/png';
      } else if (filePath) {
        // Validate path for security (prevent path traversal)
        const pathValidator = createPathValidator();
        const pathValidation = pathValidator.validate(filePath);
        if (!pathValidation.valid) {
          logger.warn({ path: filePath, error: pathValidation.error }, 'Path validation failed');
          return { success: false, error: pathValidation.error };
        }
        const buffer = await readFile(pathValidation.normalizedPath!);
        imageBase64 = buffer.toString('base64');
        const ext = extname(pathValidation.normalizedPath!).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        imageMimeType = mimeTypes[ext] || 'image/png';
      } else {
        return { success: false, error: 'Either filePath or base64Content is required' };
      }

      // Return image data ready for Claude vision API
      // The actual OCR would be done by calling Claude's vision capabilities
      return {
        success: true,
        data: {
          imageReady: true,
          mimeType: imageMimeType,
          base64Length: imageBase64.length,
          targetFields: targetFields || [
            'ManufacturerName',
            'SerialNumber',
            'ManufacturerProductDesignation',
            'YearOfConstruction',
          ],
          // Provide the image data for downstream vision processing
          imageData: {
            type: 'base64',
            media_type: imageMimeType,
            data: imageBase64,
          },
          suggestedPatches: [],
          message: 'Image loaded and ready for vision API processing. Use Claude vision to extract text.',
          hint: 'To extract text, send this image to Claude with a prompt asking to identify nameplate/label information.',
        },
      };
    } catch (err) {
      logger.error({ err }, 'Image import failed');
      return {
        success: false,
        error: `Image import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Merge another AAS document
 */
const importAas: ToolDefinition = {
  name: 'import_aas',
  description: 'Merge submodels or elements from another AASX file into the current document.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the source AASX file',
      },
      base64Content: {
        type: 'string',
        description: 'Base64-encoded AASX content (alternative to filePath)',
      },
      submodelIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific submodel IDs to import (optional, imports all if not specified)',
      },
      mergeStrategy: {
        type: 'string',
        enum: ['replace', 'merge', 'skip'],
        description: 'How to handle conflicts: replace=overwrite, merge=combine, skip=keep existing (default: skip)',
      },
    },
    required: [],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { filePath, base64Content, submodelIds, mergeStrategy = 'skip' } = params as {
      filePath?: string;
      base64Content?: string;
      submodelIds?: string[];
      mergeStrategy?: 'replace' | 'merge' | 'skip';
    };
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No target document loaded. Load a document first.' };
    }

    logger.info({ filePath, submodelIds, mergeStrategy }, 'Importing AAS');

    try {
      // Get AASX buffer
      let aasxBuffer: ArrayBuffer;
      if (base64Content) {
        const buffer = Buffer.from(base64Content, 'base64');
        aasxBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } else if (filePath) {
        // Validate path for security (prevent path traversal)
        const pathValidator = createPathValidator();
        const pathValidation = pathValidator.validate(filePath);
        if (!pathValidation.valid) {
          logger.warn({ path: filePath, error: pathValidation.error }, 'Path validation failed');
          return { success: false, error: pathValidation.error };
        }
        const buffer = await readFile(pathValidation.normalizedPath!);
        aasxBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } else {
        return { success: false, error: 'Either filePath or base64Content is required' };
      }

      // Parse source AASX
      const sourceResult = await readAasx(aasxBuffer);
      const sourceEnv = sourceResult.environment;
      const targetEnv = session.documentState.environment as Environment;

      // Filter submodels if specific IDs requested
      let submodelsToImport = sourceEnv.submodels || [];
      if (submodelIds && submodelIds.length > 0) {
        submodelsToImport = submodelsToImport.filter(
          (sm) => submodelIds.includes(sm.id) || submodelIds.includes(sm.idShort || '')
        );
      }

      // Detect conflicts
      const targetSubmodelIds = new Set((targetEnv.submodels || []).map((sm) => sm.id));
      const conflicts: Array<{ id: string; action: string }> = [];
      const importedSubmodels: Submodel[] = [];
      const suggestedPatches: Array<{ op: string; path: string; value?: unknown }> = [];

      for (const sourceSubmodel of submodelsToImport) {
        const hasConflict = targetSubmodelIds.has(sourceSubmodel.id);

        if (hasConflict) {
          switch (mergeStrategy) {
            case 'replace': {
              // Find index of existing submodel and replace
              const existingIndex = (targetEnv.submodels || []).findIndex(
                (sm) => sm.id === sourceSubmodel.id
              );
              if (existingIndex >= 0) {
                suggestedPatches.push({
                  op: 'replace',
                  path: `/submodels/${existingIndex}`,
                  value: sourceSubmodel,
                });
                conflicts.push({ id: sourceSubmodel.id, action: 'replace' });
                importedSubmodels.push(sourceSubmodel);
              }
              break;
            }
            case 'merge': {
              // Calculate diff by wrapping submodels in temporary environments
              const existingSubmodel = (targetEnv.submodels || []).find(
                (sm) => sm.id === sourceSubmodel.id
              );
              if (existingSubmodel) {
                // Create temporary environments containing just these submodels
                const beforeEnv: Environment = { submodels: [existingSubmodel] };
                const afterEnv: Environment = { submodels: [sourceSubmodel] };
                const diff = calculateDiff(beforeEnv, afterEnv);

                if (diff.entries.length > 0) {
                  const existingIndex = (targetEnv.submodels || []).findIndex(
                    (sm) => sm.id === sourceSubmodel.id
                  );
                  // Add patches for each change
                  for (const entry of diff.entries) {
                    if (entry.type === 'added' || entry.type === 'modified') {
                      // Adjust path from temporary /submodels/0 to actual index
                      const adjustedPath = (entry.afterPath || entry.beforePath || '')
                        .replace('/submodels/0', `/submodels/${existingIndex}`);
                      suggestedPatches.push({
                        op: entry.type === 'added' ? 'add' : 'replace',
                        path: adjustedPath,
                        value: entry.afterValue,
                      });
                    }
                  }
                  conflicts.push({ id: sourceSubmodel.id, action: 'merge' });
                  importedSubmodels.push(sourceSubmodel);
                }
              }
              break;
            }
            case 'skip':
            default:
              conflicts.push({ id: sourceSubmodel.id, action: 'skipped' });
              break;
          }
        } else {
          // No conflict - add new submodel
          suggestedPatches.push({
            op: 'add',
            path: '/submodels/-',
            value: sourceSubmodel,
          });
          importedSubmodels.push(sourceSubmodel);
        }
      }

      // Also import AAS shells if present
      const importedShells: string[] = [];
      if (sourceEnv.assetAdministrationShells) {
        for (const shell of sourceEnv.assetAdministrationShells) {
          const existingShell = (targetEnv.assetAdministrationShells || []).find(
            (s) => s.id === shell.id
          );
          if (!existingShell) {
            suggestedPatches.push({
              op: 'add',
              path: '/assetAdministrationShells/-',
              value: shell,
            });
            importedShells.push(shell.id);
          }
        }
      }

      return {
        success: true,
        data: {
          sourceSubmodelCount: submodelsToImport.length,
          importedSubmodels: importedSubmodels.map((sm) => ({
            id: sm.id,
            idShort: sm.idShort,
            elementCount: sm.submodelElements?.length || 0,
          })),
          importedShells,
          conflicts,
          suggestedPatches,
          message: `Found ${submodelsToImport.length} submodel(s) to import, ${conflicts.length} conflict(s) detected`,
        },
      };
    } catch (err) {
      logger.error({ err }, 'AAS import failed');
      return {
        success: false,
        error: `AAS import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Suggest template-based structure
 */
const suggestFromTemplate: ToolDefinition = {
  name: 'import_suggest_template',
  description: 'Generate a submodel structure based on an IDTA template.',
  inputSchema: {
    type: 'object',
    properties: {
      templateId: {
        type: 'string',
        description:
          'The template ID, semantic ID, or name (e.g., "Digital Nameplate", "idta-digital-nameplate", or full semantic ID)',
      },
      prefillData: {
        type: 'object',
        description: 'Initial data to prefill property values (e.g., {"ManufacturerName": "Acme Corp"})',
      },
      includeOptional: {
        type: 'boolean',
        description: 'Include optional elements in the generated structure (default: false)',
      },
    },
    required: ['templateId'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { templateId, prefillData, includeOptional = false } = params as {
      templateId: string;
      prefillData?: Record<string, unknown>;
      includeOptional?: boolean;
    };
    const { session, logger } = context;

    logger.info({ templateId, includeOptional }, 'Generating from template');

    // Find the template
    const template = findTemplate(templateId);

    if (!template) {
      // List available templates in error message
      const availableTemplates = TEMPLATE_REGISTRY.templates.map((t) => ({
        id: t.id,
        name: t.name,
        semanticId: t.semanticId,
      }));

      return {
        success: false,
        error: `Template not found: "${templateId}"`,
        data: {
          availableTemplates,
          hint: 'Use one of the available template IDs, names, or semantic IDs',
        },
      };
    }

    // Generate the submodel structure
    const submodel = generateSubmodelFromTemplate(template, prefillData, includeOptional);

    // Generate JSON Patch operations to add this submodel
    const env = session.documentState?.environment as Environment | undefined;
    const submodelCount = env?.submodels?.length ?? 0;

    const suggestedPatches = [
      {
        op: 'add' as const,
        path: `/submodels/${submodelCount}`,
        value: submodel,
      },
    ];

    return {
      success: true,
      data: {
        template: {
          id: template.id,
          name: template.name,
          version: template.version,
          semanticId: template.semanticId,
          description: template.description,
        },
        generatedStructure: submodel,
        suggestedPatches,
        requiredElements: template.requiredElements,
        optionalElements: template.optionalElements,
        message: `Generated ${template.name} submodel with ${submodel.submodelElements?.length ?? 0} elements`,
      },
    };
  },
};

export const importTools: ToolDefinition[] = [
  importPdf,
  importSpreadsheet,
  importImage,
  importAas,
  suggestFromTemplate,
];
