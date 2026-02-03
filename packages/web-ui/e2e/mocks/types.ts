/**
 * Type definitions for E2E mock data
 */

export interface SemanticId {
  type: 'ExternalReference' | 'ModelReference';
  keys: Array<{
    type: string;
    value: string;
  }>;
}

export interface Reference {
  type: 'ModelReference' | 'ExternalReference';
  keys: Array<{
    type: string;
    value: string;
  }>;
}

export interface Property {
  modelType: 'Property';
  idShort: string;
  valueType?: string;
  value?: string | number | boolean;
  semanticId?: SemanticId;
}

export interface SubmodelElementCollection {
  modelType: 'SubmodelElementCollection';
  idShort: string;
  value?: SubmodelElement[];
  semanticId?: SemanticId;
}

export type SubmodelElement = Property | SubmodelElementCollection;

export interface Submodel {
  modelType: 'Submodel';
  id: string;
  idShort?: string;
  semanticId?: SemanticId;
  submodelElements?: SubmodelElement[];
}

export interface AssetInformation {
  assetKind: 'Instance' | 'Type' | 'NotApplicable';
  globalAssetId?: string;
}

export interface AssetAdministrationShell {
  modelType: 'AssetAdministrationShell';
  id: string;
  idShort?: string;
  assetInformation: AssetInformation;
  submodels?: Reference[];
}

export interface ConceptDescription {
  modelType: 'ConceptDescription';
  id: string;
  idShort?: string;
}

export interface Environment {
  assetAdministrationShells?: AssetAdministrationShell[];
  submodels?: Submodel[];
  conceptDescriptions?: ConceptDescription[];
}

export interface PendingOperation {
  id: string;
  toolName: string;
  tier: number;
  reason: string;
  patches?: Array<{
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy';
    path: string;
    value?: unknown;
    from?: string;
  }>;
}
