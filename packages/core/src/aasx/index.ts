/**
 * AASX file handling - OPC-based ZIP with relationships
 */

export { readAasx, type ReadAasxOptions, type ReadAasxResult } from './reader.js';
export { writeAasx, type WriteAasxOptions } from './writer.js';
export {
  parseOpcRelationships,
  parseContentTypes,
  generateOpcRelationships,
  generateContentTypes,
  findAasSpecPath,
  getContentTypeForPath,
  isJsonContentType,
  isXmlContentType,
  OPC_RELATIONSHIP_TYPES,
  AAS_CONTENT_TYPES,
  type OpcRelationship,
  type ContentTypes,
  type ContentTypeDefault,
  type ContentTypeOverride,
} from './opc.js';
