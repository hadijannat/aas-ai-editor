/**
 * AAS Metamodel Types
 *
 * Based on the AAS Metamodel specification (Part 1).
 * These are simplified types for the editor - full spec has more fields.
 */

/**
 * Model type identifiers
 */
export type ModelType =
  | 'AssetAdministrationShell'
  | 'Submodel'
  | 'Property'
  | 'MultiLanguageProperty'
  | 'Range'
  | 'Blob'
  | 'File'
  | 'ReferenceElement'
  | 'SubmodelElementCollection'
  | 'SubmodelElementList'
  | 'Entity'
  | 'BasicEventElement'
  | 'Operation'
  | 'Capability'
  | 'AnnotatedRelationshipElement'
  | 'RelationshipElement'
  | 'ConceptDescription';

/**
 * Key types for references
 */
export type KeyType =
  | 'GlobalReference'
  | 'FragmentReference'
  | 'AssetAdministrationShell'
  | 'Submodel'
  | 'ConceptDescription'
  | 'SubmodelElement';

/**
 * A key in a reference chain
 */
export interface Key {
  type: KeyType;
  value: string;
}

/**
 * Reference to another element
 */
export interface Reference {
  type: 'ExternalReference' | 'ModelReference';
  keys: Key[];
}

/**
 * Semantic identifier
 */
export type SemanticId = Reference;

/**
 * Base for all identifiable elements
 */
export interface Identifiable {
  id: string;
  idShort?: string;
  description?: LangStringSet;
  administration?: AdministrativeInformation;
}

/**
 * Base for all referable elements
 */
export interface Referable {
  idShort?: string;
  description?: LangStringSet;
  displayName?: LangStringSet;
}

/**
 * Administrative information
 */
export interface AdministrativeInformation {
  version?: string;
  revision?: string;
}

/**
 * Multi-language string
 */
export interface LangString {
  language: string;
  text: string;
}

export type LangStringSet = LangString[];

/**
 * Asset information
 */
export interface AssetInformation {
  assetKind: 'Instance' | 'NotApplicable' | 'Type';
  globalAssetId?: string;
  specificAssetIds?: SpecificAssetId[];
  assetType?: string;
  defaultThumbnail?: Resource;
}

export interface SpecificAssetId {
  name: string;
  value: string;
  externalSubjectId?: Reference;
}

export interface Resource {
  path: string;
  contentType?: string;
}

/**
 * Asset Administration Shell
 */
export interface AssetAdministrationShell extends Identifiable {
  modelType: 'AssetAdministrationShell';
  assetInformation: AssetInformation;
  submodels?: Reference[];
  derivedFrom?: Reference;
}

/**
 * Submodel
 */
export interface Submodel extends Identifiable {
  modelType: 'Submodel';
  semanticId?: SemanticId;
  submodelElements?: SubmodelElement[];
  kind?: 'Instance' | 'Template';
}

/**
 * Property - a data element with a single value
 */
export interface Property extends Referable {
  modelType: 'Property';
  semanticId?: SemanticId;
  valueType: ValueType;
  value?: string;
  valueId?: Reference;
}

/**
 * Supported value types
 */
export type ValueType =
  | 'xs:string'
  | 'xs:boolean'
  | 'xs:integer'
  | 'xs:int'
  | 'xs:long'
  | 'xs:short'
  | 'xs:byte'
  | 'xs:unsignedInt'
  | 'xs:unsignedLong'
  | 'xs:unsignedShort'
  | 'xs:unsignedByte'
  | 'xs:double'
  | 'xs:float'
  | 'xs:decimal'
  | 'xs:dateTime'
  | 'xs:date'
  | 'xs:time'
  | 'xs:duration'
  | 'xs:anyURI'
  | 'xs:base64Binary'
  | 'xs:hexBinary';

/**
 * Submodel Element Collection
 */
export interface SubmodelElementCollection extends Referable {
  modelType: 'SubmodelElementCollection';
  semanticId?: SemanticId;
  value?: SubmodelElement[];
}

/**
 * Multi-language property
 */
export interface MultiLanguageProperty extends Referable {
  modelType: 'MultiLanguageProperty';
  semanticId?: SemanticId;
  value?: LangStringSet;
  valueId?: Reference;
}

/**
 * File reference
 */
export interface File extends Referable {
  modelType: 'File';
  semanticId?: SemanticId;
  contentType: string;
  value?: string;
}

/**
 * Blob - binary large object
 */
export interface Blob extends Referable {
  modelType: 'Blob';
  semanticId?: SemanticId;
  contentType: string;
  value?: string; // base64 encoded
}

/**
 * Reference element - points to another element
 */
export interface ReferenceElement extends Referable {
  modelType: 'ReferenceElement';
  semanticId?: SemanticId;
  value?: Reference;
}

/**
 * Range - a range of values
 */
export interface Range extends Referable {
  modelType: 'Range';
  semanticId?: SemanticId;
  valueType: ValueType;
  min?: string;
  max?: string;
}

/**
 * Union type for all submodel elements
 */
export type SubmodelElement =
  | Property
  | MultiLanguageProperty
  | SubmodelElementCollection
  | File
  | Blob
  | ReferenceElement
  | Range;

/**
 * Concept Description
 */
export interface ConceptDescription extends Identifiable {
  modelType: 'ConceptDescription';
  isCaseOf?: Reference[];
  embeddedDataSpecifications?: EmbeddedDataSpecification[];
}

export interface EmbeddedDataSpecification {
  dataSpecification: Reference;
  dataSpecificationContent: DataSpecificationContent;
}

export interface DataSpecificationContent {
  // Simplified - full spec has many fields
  preferredName?: LangStringSet;
  shortName?: LangStringSet;
  unit?: string;
  dataType?: string;
  definition?: LangStringSet;
}

/**
 * The root AAS Environment containing all elements
 */
export interface Environment {
  assetAdministrationShells?: AssetAdministrationShell[];
  submodels?: Submodel[];
  conceptDescriptions?: ConceptDescription[];
}
