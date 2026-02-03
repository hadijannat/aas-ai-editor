import { describe, it, expect } from 'vitest';
import { calculateDiff } from '../../src/diff/calculate.js';
import type { Environment, Submodel, Property, SubmodelElementCollection, MultiLanguageProperty, Range, File, Blob, ReferenceElement, AssetAdministrationShell, ConceptDescription } from '../../src/aas/types.js';

// Helper to create a minimal valid environment
function createEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    assetAdministrationShells: [],
    submodels: [],
    conceptDescriptions: [],
    ...overrides,
  };
}

// Helper to create a minimal submodel
function createSubmodel(id: string, idShort: string, elements: Environment['submodels'][0]['submodelElements'] = []): Submodel {
  return {
    modelType: 'Submodel',
    id,
    idShort,
    submodelElements: elements,
  };
}

// Helper to create a property
function createProperty(idShort: string, value?: string, valueType: string = 'xs:string'): Property {
  return {
    modelType: 'Property',
    idShort,
    value,
    valueType: valueType as Property['valueType'],
  };
}

describe('calculateDiff', () => {
  describe('identical environments', () => {
    it('should return identical=true for empty environments', () => {
      const before = createEnvironment();
      const after = createEnvironment();

      const result = calculateDiff(before, after);

      expect(result.identical).toBe(true);
      expect(result.changeCount).toBe(0);
      expect(result.entries).toHaveLength(0);
    });

    it('should return identical=true for environments with same submodels', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createProperty('ManufacturerName', 'Acme')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createProperty('ManufacturerName', 'Acme')])],
      });

      const result = calculateDiff(before, after);

      expect(result.identical).toBe(true);
      expect(result.changeCount).toBe(0);
    });
  });

  describe('submodel changes', () => {
    it('should detect added submodel', () => {
      const before = createEnvironment();
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate')],
      });

      const result = calculateDiff(before, after);

      expect(result.identical).toBe(false);
      expect(result.additions).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        type: 'added',
        afterPath: '/submodels/0',
        idShort: 'Nameplate',
      });
    });

    it('should detect removed submodel', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate')],
      });
      const after = createEnvironment();

      const result = calculateDiff(before, after);

      expect(result.identical).toBe(false);
      expect(result.removals).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'removed',
        beforePath: '/submodels/0',
        idShort: 'Nameplate',
      });
    });

    it('should match submodels by id, not index', () => {
      const before = createEnvironment({
        submodels: [
          createSubmodel('sm-1', 'First'),
          createSubmodel('sm-2', 'Second'),
        ],
      });
      const after = createEnvironment({
        submodels: [
          createSubmodel('sm-2', 'Second'), // Reordered
          createSubmodel('sm-1', 'First'),
        ],
      });

      const result = calculateDiff(before, after);

      expect(result.identical).toBe(true);
    });
  });

  describe('Property changes', () => {
    it('should detect modified property value', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createProperty('ManufacturerName', 'Acme')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createProperty('ManufacturerName', 'NewCorp')])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'ManufacturerName',
        beforeValue: 'Acme',
        afterValue: 'NewCorp',
        description: 'Property "ManufacturerName" value changed',
      });
    });

    it('should detect modified property valueType', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Data', [createProperty('Count', '10', 'xs:string')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Data', [createProperty('Count', '10', 'xs:integer')])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'Count',
        beforeValue: 'xs:string',
        afterValue: 'xs:integer',
      });
    });

    it('should detect added property', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createProperty('ManufacturerName', 'Acme')])],
      });

      const result = calculateDiff(before, after);

      expect(result.additions).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'added',
        idShort: 'ManufacturerName',
      });
    });

    it('should detect removed property', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createProperty('ManufacturerName', 'Acme')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [])],
      });

      const result = calculateDiff(before, after);

      expect(result.removals).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'removed',
        idShort: 'ManufacturerName',
      });
    });
  });

  describe('SubmodelElementCollection changes', () => {
    it('should detect nested property changes', () => {
      const createCollection = (value: string): SubmodelElementCollection => ({
        modelType: 'SubmodelElementCollection',
        idShort: 'Address',
        value: [createProperty('Street', value)],
      });

      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createCollection('123 Main St')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [createCollection('456 Oak Ave')])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'Street',
        beforeValue: '123 Main St',
        afterValue: '456 Oak Ave',
      });
      expect(result.entries[0].beforePath).toContain('/value/');
    });

    it('should detect added element in collection', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [{
          modelType: 'SubmodelElementCollection',
          idShort: 'Address',
          value: [],
        } as SubmodelElementCollection])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [{
          modelType: 'SubmodelElementCollection',
          idShort: 'Address',
          value: [createProperty('Street', '123 Main')],
        } as SubmodelElementCollection])],
      });

      const result = calculateDiff(before, after);

      expect(result.additions).toBe(1);
      expect(result.entries[0].idShort).toBe('Street');
    });
  });

  describe('MultiLanguageProperty changes', () => {
    it('should detect modified multi-language value', () => {
      const createMlp = (texts: { language: string; text: string }[]): MultiLanguageProperty => ({
        modelType: 'MultiLanguageProperty',
        idShort: 'ProductName',
        value: texts,
      });

      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [
          createMlp([{ language: 'en', text: 'Product' }]),
        ])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [
          createMlp([{ language: 'en', text: 'Updated Product' }]),
        ])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'ProductName',
        description: 'MultiLanguageProperty "ProductName" value changed',
      });
    });

    it('should detect added language in multi-language value', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [{
          modelType: 'MultiLanguageProperty',
          idShort: 'ProductName',
          value: [{ language: 'en', text: 'Product' }],
        } as MultiLanguageProperty])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [{
          modelType: 'MultiLanguageProperty',
          idShort: 'ProductName',
          value: [
            { language: 'en', text: 'Product' },
            { language: 'de', text: 'Produkt' },
          ],
        } as MultiLanguageProperty])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
    });

    it('should treat same values in different order as identical', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [{
          modelType: 'MultiLanguageProperty',
          idShort: 'ProductName',
          value: [
            { language: 'en', text: 'Product' },
            { language: 'de', text: 'Produkt' },
          ],
        } as MultiLanguageProperty])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Nameplate', [{
          modelType: 'MultiLanguageProperty',
          idShort: 'ProductName',
          value: [
            { language: 'de', text: 'Produkt' },
            { language: 'en', text: 'Product' },
          ],
        } as MultiLanguageProperty])],
      });

      const result = calculateDiff(before, after);

      expect(result.identical).toBe(true);
    });
  });

  describe('Range changes', () => {
    it('should detect modified Range min', () => {
      const createRange = (min: string, max: string): Range => ({
        modelType: 'Range',
        idShort: 'Temperature',
        valueType: 'xs:double',
        min,
        max,
      });

      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Specs', [createRange('0', '100')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Specs', [createRange('-10', '100')])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'Temperature',
        beforeValue: '0',
        afterValue: '-10',
        description: 'Range "Temperature" min changed',
      });
    });

    it('should detect modified Range max', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Specs', [{
          modelType: 'Range',
          idShort: 'Temperature',
          valueType: 'xs:double',
          min: '0',
          max: '100',
        } as Range])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Specs', [{
          modelType: 'Range',
          idShort: 'Temperature',
          valueType: 'xs:double',
          min: '0',
          max: '200',
        } as Range])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0].description).toContain('max changed');
    });
  });

  describe('File changes', () => {
    it('should detect modified File value', () => {
      const createFile = (value: string): File => ({
        modelType: 'File',
        idShort: 'Manual',
        contentType: 'application/pdf',
        value,
      });

      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Docs', [createFile('/files/manual_v1.pdf')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Docs', [createFile('/files/manual_v2.pdf')])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'Manual',
        description: 'File "Manual" value changed',
      });
    });

    it('should detect modified File contentType', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Docs', [{
          modelType: 'File',
          idShort: 'Manual',
          contentType: 'application/pdf',
          value: '/files/manual.pdf',
        } as File])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Docs', [{
          modelType: 'File',
          idShort: 'Manual',
          contentType: 'application/octet-stream',
          value: '/files/manual.pdf',
        } as File])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0].description).toContain('contentType changed');
    });
  });

  describe('Blob changes', () => {
    it('should detect modified Blob value', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Data', [{
          modelType: 'Blob',
          idShort: 'Image',
          contentType: 'image/png',
          value: 'aGVsbG8=', // "hello" in base64
        } as Blob])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Data', [{
          modelType: 'Blob',
          idShort: 'Image',
          contentType: 'image/png',
          value: 'd29ybGQ=', // "world" in base64
        } as Blob])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'Image',
        beforeValue: '[base64 data]',
        afterValue: '[base64 data]',
        description: 'Blob "Image" value changed',
      });
    });
  });

  describe('ReferenceElement changes', () => {
    it('should detect modified ReferenceElement value', () => {
      const createRefElement = (targetId: string): ReferenceElement => ({
        modelType: 'ReferenceElement',
        idShort: 'RelatedSubmodel',
        value: {
          type: 'ModelReference',
          keys: [{ type: 'Submodel', value: targetId }],
        },
      });

      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Main', [createRefElement('sm-target-1')])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Main', [createRefElement('sm-target-2')])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        idShort: 'RelatedSubmodel',
        description: 'ReferenceElement "RelatedSubmodel" value changed',
      });
    });
  });

  describe('AAS changes', () => {
    it('should detect added AAS', () => {
      const before = createEnvironment();
      const after = createEnvironment({
        assetAdministrationShells: [{
          modelType: 'AssetAdministrationShell',
          id: 'aas-1',
          idShort: 'MyAAS',
          assetInformation: { assetKind: 'Instance', globalAssetId: 'asset-1' },
        }],
      });

      const result = calculateDiff(before, after);

      expect(result.additions).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'added',
        afterPath: '/assetAdministrationShells/0',
        idShort: 'MyAAS',
      });
    });

    it('should detect removed AAS', () => {
      const before = createEnvironment({
        assetAdministrationShells: [{
          modelType: 'AssetAdministrationShell',
          id: 'aas-1',
          idShort: 'MyAAS',
          assetInformation: { assetKind: 'Instance', globalAssetId: 'asset-1' },
        }],
      });
      const after = createEnvironment();

      const result = calculateDiff(before, after);

      expect(result.removals).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'removed',
        beforePath: '/assetAdministrationShells/0',
      });
    });

    it('should detect modified AAS globalAssetId', () => {
      const createAas = (globalAssetId: string): AssetAdministrationShell => ({
        modelType: 'AssetAdministrationShell',
        id: 'aas-1',
        idShort: 'MyAAS',
        assetInformation: { assetKind: 'Instance', globalAssetId },
      });

      const before = createEnvironment({
        assetAdministrationShells: [createAas('asset-1')],
      });
      const after = createEnvironment({
        assetAdministrationShells: [createAas('asset-2')],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'modified',
        beforeValue: 'asset-1',
        afterValue: 'asset-2',
        description: 'AAS "MyAAS" globalAssetId changed',
      });
    });

    it('should detect modified AAS assetKind', () => {
      const before = createEnvironment({
        assetAdministrationShells: [{
          modelType: 'AssetAdministrationShell',
          id: 'aas-1',
          idShort: 'MyAAS',
          assetInformation: { assetKind: 'Instance', globalAssetId: 'asset-1' },
        }],
      });
      const after = createEnvironment({
        assetAdministrationShells: [{
          modelType: 'AssetAdministrationShell',
          id: 'aas-1',
          idShort: 'MyAAS',
          assetInformation: { assetKind: 'Type', globalAssetId: 'asset-1' },
        }],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0].description).toContain('assetKind changed');
    });

    it('should detect added submodel reference in AAS', () => {
      const before = createEnvironment({
        assetAdministrationShells: [{
          modelType: 'AssetAdministrationShell',
          id: 'aas-1',
          idShort: 'MyAAS',
          assetInformation: { assetKind: 'Instance' },
          submodels: [],
        }],
      });
      const after = createEnvironment({
        assetAdministrationShells: [{
          modelType: 'AssetAdministrationShell',
          id: 'aas-1',
          idShort: 'MyAAS',
          assetInformation: { assetKind: 'Instance' },
          submodels: [{ type: 'ModelReference', keys: [{ type: 'Submodel', value: 'sm-1' }] }],
        }],
      });

      const result = calculateDiff(before, after);

      expect(result.additions).toBe(1);
      expect(result.entries[0].description).toContain('submodel reference');
    });
  });

  describe('ConceptDescription changes', () => {
    it('should detect added ConceptDescription', () => {
      const before = createEnvironment();
      const after = createEnvironment({
        conceptDescriptions: [{
          modelType: 'ConceptDescription',
          id: 'cd-1',
          idShort: 'ManufacturerNameConcept',
        }],
      });

      const result = calculateDiff(before, after);

      expect(result.additions).toBe(1);
      expect(result.entries[0]).toMatchObject({
        type: 'added',
        afterPath: '/conceptDescriptions/0',
        idShort: 'ManufacturerNameConcept',
      });
    });

    it('should detect removed ConceptDescription', () => {
      const before = createEnvironment({
        conceptDescriptions: [{
          modelType: 'ConceptDescription',
          id: 'cd-1',
          idShort: 'ManufacturerNameConcept',
        }],
      });
      const after = createEnvironment();

      const result = calculateDiff(before, after);

      expect(result.removals).toBe(1);
    });

    it('should detect modified ConceptDescription isCaseOf', () => {
      const before = createEnvironment({
        conceptDescriptions: [{
          modelType: 'ConceptDescription',
          id: 'cd-1',
          idShort: 'MyConcept',
          isCaseOf: [{ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'urn:old' }] }],
        }],
      });
      const after = createEnvironment({
        conceptDescriptions: [{
          modelType: 'ConceptDescription',
          id: 'cd-1',
          idShort: 'MyConcept',
          isCaseOf: [{ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'urn:new' }] }],
        }],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0].description).toContain('isCaseOf changed');
    });

    it('should detect modified ConceptDescription preferredName', () => {
      const before = createEnvironment({
        conceptDescriptions: [{
          modelType: 'ConceptDescription',
          id: 'cd-1',
          idShort: 'MyConcept',
          embeddedDataSpecifications: [{
            dataSpecification: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'spec' }] },
            dataSpecificationContent: {
              preferredName: [{ language: 'en', text: 'Old Name' }],
            },
          }],
        }],
      });
      const after = createEnvironment({
        conceptDescriptions: [{
          modelType: 'ConceptDescription',
          id: 'cd-1',
          idShort: 'MyConcept',
          embeddedDataSpecifications: [{
            dataSpecification: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'spec' }] },
            dataSpecificationContent: {
              preferredName: [{ language: 'en', text: 'New Name' }],
            },
          }],
        }],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0].description).toContain('preferredName changed');
    });
  });

  describe('modelType changes', () => {
    it('should detect when element modelType changes', () => {
      const before = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Data', [{
          modelType: 'Property',
          idShort: 'Value',
          value: '42',
          valueType: 'xs:string',
        } as Property])],
      });
      const after = createEnvironment({
        submodels: [createSubmodel('sm-1', 'Data', [{
          modelType: 'Range',
          idShort: 'Value',
          min: '0',
          max: '100',
          valueType: 'xs:integer',
        } as Range])],
      });

      const result = calculateDiff(before, after);

      expect(result.modifications).toBe(1);
      expect(result.entries[0].description).toContain('modelType changed');
    });
  });

  describe('summary calculations', () => {
    it('should correctly count additions, removals, and modifications', () => {
      const before = createEnvironment({
        submodels: [
          createSubmodel('sm-1', 'First', [createProperty('A', 'a')]),
          createSubmodel('sm-2', 'Second', []), // Will be removed
        ],
      });
      const after = createEnvironment({
        submodels: [
          createSubmodel('sm-1', 'First', [createProperty('A', 'modified')]), // Modified
          createSubmodel('sm-3', 'Third', []), // Added
        ],
      });

      const result = calculateDiff(before, after);

      expect(result.additions).toBe(1); // sm-3
      expect(result.removals).toBe(1); // sm-2
      expect(result.modifications).toBe(1); // property A
      expect(result.changeCount).toBe(3);
      expect(result.identical).toBe(false);
    });
  });
});
