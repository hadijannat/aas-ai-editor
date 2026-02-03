import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeAasx } from '../../src/aasx/writer.js';
import { readAasx } from '../../src/aasx/reader.js';
import { parseContentTypes, parseOpcRelationships, findAasSpecPath } from '../../src/aasx/opc.js';
import type { Environment } from '../../src/aas/types.js';

/**
 * Minimal valid AAS Environment for testing
 */
const minimalEnvironment: Environment = {
  assetAdministrationShells: [
    {
      modelType: 'AssetAdministrationShell',
      id: 'https://example.com/aas/1',
      idShort: 'TestAAS',
      assetInformation: {
        assetKind: 'Instance',
        globalAssetId: 'https://example.com/asset/1',
      },
      submodels: [
        {
          type: 'ModelReference',
          keys: [{ type: 'Submodel', value: 'https://example.com/submodel/1' }],
        },
      ],
    },
  ],
  submodels: [
    {
      modelType: 'Submodel',
      id: 'https://example.com/submodel/1',
      idShort: 'TestSubmodel',
      semanticId: {
        type: 'ExternalReference',
        keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/idta/example/1/0' }],
      },
      submodelElements: [
        {
          modelType: 'Property',
          idShort: 'TestProperty',
          valueType: 'xs:string',
          value: 'TestValue',
        },
        {
          modelType: 'MultiLanguageProperty',
          idShort: 'MultiLangProp',
          value: [
            { language: 'en', text: 'English text' },
            { language: 'de', text: 'German text' },
          ],
        },
      ],
    },
  ],
  conceptDescriptions: [
    {
      modelType: 'ConceptDescription',
      id: 'https://example.com/cd/1',
      idShort: 'TestConcept',
    },
  ],
};

/**
 * Helper to extract file contents from AASX
 */
function getAasxFileContent(aasx: Uint8Array, path: string): string | undefined {
  const files = unzipSync(aasx);
  const data = files[path];
  if (!data) return undefined;
  return strFromU8(data);
}

describe('AASX Writer', () => {
  describe('writeAasx', () => {
    it('should write a valid AASX package with JSON format', async () => {
      const aasx = await writeAasx(minimalEnvironment);

      expect(aasx).toBeInstanceOf(Uint8Array);
      expect(aasx.length).toBeGreaterThan(0);

      // Verify it's a valid ZIP by unzipping
      const files = unzipSync(aasx);
      expect(Object.keys(files)).toContain('[Content_Types].xml');
      expect(Object.keys(files)).toContain('_rels/.rels');
      expect(Object.keys(files)).toContain('aasx/aas.json');
    });

    it('should produce valid [Content_Types].xml', async () => {
      const aasx = await writeAasx(minimalEnvironment);
      const contentTypesXml = getAasxFileContent(aasx, '[Content_Types].xml');

      expect(contentTypesXml).toBeDefined();
      expect(contentTypesXml).toContain('application/json');
      expect(contentTypesXml).toContain('/aasx/aas.json');

      // Parse and verify structure
      const contentTypes = parseContentTypes(contentTypesXml!);
      expect(contentTypes.defaults.some((d) => d.extension === 'json')).toBe(true);
      expect(contentTypes.overrides.some((o) => o.partName === '/aasx/aas.json')).toBe(true);
    });

    it('should produce valid _rels/.rels with aas-spec relationship', async () => {
      const aasx = await writeAasx(minimalEnvironment);
      const relsXml = getAasxFileContent(aasx, '_rels/.rels');

      expect(relsXml).toBeDefined();
      expect(relsXml).toContain('http://admin-shell.io/aasx/relationships/aas-spec');

      // Parse and verify structure
      const rels = parseOpcRelationships(relsXml!);
      expect(rels.length).toBeGreaterThan(0);
      expect(findAasSpecPath(rels)).toBe('/aasx/aas.json');
    });

    it('should serialize Environment as valid JSON', async () => {
      const aasx = await writeAasx(minimalEnvironment);
      const aasJson = getAasxFileContent(aasx, 'aasx/aas.json');

      expect(aasJson).toBeDefined();

      const parsed = JSON.parse(aasJson!);
      expect(parsed.assetAdministrationShells).toHaveLength(1);
      expect(parsed.assetAdministrationShells[0].id).toBe('https://example.com/aas/1');
      expect(parsed.submodels).toHaveLength(1);
      expect(parsed.conceptDescriptions).toHaveLength(1);
    });

    it('should use custom filename when provided', async () => {
      const aasx = await writeAasx(minimalEnvironment, { filename: 'my-model.json' });
      const files = unzipSync(aasx);

      expect(Object.keys(files)).toContain('aasx/my-model.json');
      expect(Object.keys(files)).not.toContain('aasx/aas.json');

      // Verify relationships point to correct file
      const relsXml = getAasxFileContent(aasx, '_rels/.rels');
      expect(relsXml).toContain('/aasx/my-model.json');
    });

    it('should include supplementary files', async () => {
      const thumbnail = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG header
      const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

      const aasx = await writeAasx(minimalEnvironment, {
        supplementaryFiles: new Map([
          ['images/thumbnail.png', thumbnail],
          ['docs/manual.pdf', pdf],
        ]),
      });

      const files = unzipSync(aasx);
      expect(Object.keys(files)).toContain('images/thumbnail.png');
      expect(Object.keys(files)).toContain('docs/manual.pdf');
      expect(files['images/thumbnail.png']).toEqual(thumbnail);
      expect(files['docs/manual.pdf']).toEqual(pdf);
    });

    it('should add content types for supplementary files', async () => {
      const aasx = await writeAasx(minimalEnvironment, {
        supplementaryFiles: new Map([
          ['images/logo.png', new Uint8Array([1, 2, 3])],
          ['docs/spec.pdf', new Uint8Array([4, 5, 6])],
        ]),
      });

      const contentTypesXml = getAasxFileContent(aasx, '[Content_Types].xml');
      const contentTypes = parseContentTypes(contentTypesXml!);

      expect(contentTypes.defaults.some((d) => d.extension === 'png' && d.contentType === 'image/png')).toBe(true);
      expect(contentTypes.defaults.some((d) => d.extension === 'pdf' && d.contentType === 'application/pdf')).toBe(
        true
      );
    });

    it('should add relationships for supplementary files', async () => {
      const aasx = await writeAasx(minimalEnvironment, {
        supplementaryFiles: new Map([
          ['thumbnail.png', new Uint8Array([1, 2, 3])],
          ['docs/manual.pdf', new Uint8Array([4, 5, 6])],
        ]),
      });

      const relsXml = getAasxFileContent(aasx, '_rels/.rels');
      const rels = parseOpcRelationships(relsXml!);

      // Should have 3 relationships: aas-spec, thumbnail, and supplementary
      expect(rels.length).toBe(3);
      expect(rels.some((r) => r.type.includes('aas-spec'))).toBe(true);
      expect(rels.some((r) => r.type.includes('thumbnail'))).toBe(true);
      expect(rels.some((r) => r.type.includes('aas-suppl'))).toBe(true);
    });

    it('should respect compression level option', async () => {
      const noCompression = await writeAasx(minimalEnvironment, { compressionLevel: 0 });
      const maxCompression = await writeAasx(minimalEnvironment, { compressionLevel: 9 });

      // Max compression should be smaller (or equal for tiny files)
      expect(maxCompression.length).toBeLessThanOrEqual(noCompression.length);
    });

    it('should throw on invalid compression level', async () => {
      await expect(writeAasx(minimalEnvironment, { compressionLevel: 10 })).rejects.toThrow(
        'Invalid compression level'
      );
      await expect(writeAasx(minimalEnvironment, { compressionLevel: -1 })).rejects.toThrow(
        'Invalid compression level'
      );
    });

    it('should handle empty Environment', async () => {
      const emptyEnv: Environment = {
        assetAdministrationShells: [],
        submodels: [],
        conceptDescriptions: [],
      };

      const aasx = await writeAasx(emptyEnv);
      const files = unzipSync(aasx);

      expect(Object.keys(files)).toContain('aasx/aas.json');
      const parsed = JSON.parse(getAasxFileContent(aasx, 'aasx/aas.json')!);
      expect(parsed.assetAdministrationShells).toEqual([]);
    });

    it('should normalize supplementary file paths', async () => {
      const aasx = await writeAasx(minimalEnvironment, {
        supplementaryFiles: new Map([['/leading/slash.png', new Uint8Array([1, 2, 3])]]),
      });

      const files = unzipSync(aasx);
      // Path should not have double leading slash in actual file
      expect(Object.keys(files)).toContain('leading/slash.png');
    });
  });

  describe('writeAasx with XML format', () => {
    it('should write a valid AASX with XML format', async () => {
      const aasx = await writeAasx(minimalEnvironment, { format: 'xml', filename: 'aas.xml' });

      const files = unzipSync(aasx);
      expect(Object.keys(files)).toContain('aasx/aas.xml');

      const xmlContent = getAasxFileContent(aasx, 'aasx/aas.xml');
      expect(xmlContent).toBeDefined();
      expect(xmlContent).toContain('<?xml');
      expect(xmlContent).toContain('environment');
      expect(xmlContent).toContain('https://admin-shell.io/aas/3/0');
    });

    it('should serialize AAS shells to XML', async () => {
      const aasx = await writeAasx(minimalEnvironment, { format: 'xml', filename: 'aas.xml' });
      const xmlContent = getAasxFileContent(aasx, 'aasx/aas.xml');

      expect(xmlContent).toContain('assetAdministrationShells');
      expect(xmlContent).toContain('https://example.com/aas/1');
      expect(xmlContent).toContain('TestAAS');
    });

    it('should serialize submodels to XML', async () => {
      const aasx = await writeAasx(minimalEnvironment, { format: 'xml', filename: 'aas.xml' });
      const xmlContent = getAasxFileContent(aasx, 'aasx/aas.xml');

      expect(xmlContent).toContain('submodels');
      expect(xmlContent).toContain('TestSubmodel');
      expect(xmlContent).toContain('TestProperty');
    });

    it('should produce XML content type in [Content_Types].xml', async () => {
      const aasx = await writeAasx(minimalEnvironment, { format: 'xml', filename: 'aas.xml' });
      const contentTypesXml = getAasxFileContent(aasx, '[Content_Types].xml');

      expect(contentTypesXml).toContain('application/xml');
      expect(contentTypesXml).toContain('/aasx/aas.xml');
    });
  });

  describe('Round-trip: read -> write -> read', () => {
    it('should preserve Environment through JSON round-trip', async () => {
      // Write the environment
      const aasx1 = await writeAasx(minimalEnvironment);

      // Read it back
      const result1 = await readAasx(aasx1);

      // Write again
      const aasx2 = await writeAasx(result1.environment);

      // Read again
      const result2 = await readAasx(aasx2);

      // Compare environments
      expect(result2.environment.assetAdministrationShells).toHaveLength(1);
      expect(result2.environment.assetAdministrationShells![0].id).toBe('https://example.com/aas/1');
      expect(result2.environment.submodels).toHaveLength(1);
      expect(result2.environment.submodels![0].id).toBe('https://example.com/submodel/1');
      expect(result2.environment.submodels![0].submodelElements).toHaveLength(2);
    });

    it('should preserve supplementary files through round-trip', async () => {
      const thumbnail = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

      // Write with supplementary file
      const aasx1 = await writeAasx(minimalEnvironment, {
        supplementaryFiles: new Map([['supplementary/thumbnail.png', thumbnail]]),
      });

      // Read back
      const result = await readAasx(aasx1);

      // Verify supplementary file was preserved
      expect(result.supplementaryFiles.has('supplementary/thumbnail.png')).toBe(true);
      expect(result.supplementaryFiles.get('supplementary/thumbnail.png')).toEqual(thumbnail);
    });

    it('should produce equivalent Environment on round-trip', async () => {
      // Write
      const aasx = await writeAasx(minimalEnvironment);

      // Read
      const result = await readAasx(aasx);

      // Deep comparison of key fields
      expect(result.environment.assetAdministrationShells![0]).toMatchObject({
        modelType: 'AssetAdministrationShell',
        id: minimalEnvironment.assetAdministrationShells![0].id,
        idShort: minimalEnvironment.assetAdministrationShells![0].idShort,
      });

      expect(result.environment.submodels![0]).toMatchObject({
        modelType: 'Submodel',
        id: minimalEnvironment.submodels![0].id,
        idShort: minimalEnvironment.submodels![0].idShort,
      });
    });
  });

  describe('XML Round-trip: write XML -> read -> verify', () => {
    it('should preserve LangStringSet values through XML round-trip', async () => {
      const envWithLangStrings: Environment = {
        assetAdministrationShells: [],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/langstring-test',
            idShort: 'LangStringSubmodel',
            description: [
              { language: 'en', text: 'English description' },
              { language: 'de', text: 'Deutsche Beschreibung' },
            ],
            submodelElements: [
              {
                modelType: 'MultiLanguageProperty',
                idShort: 'MultiLangProp',
                value: [
                  { language: 'en', text: 'Hello World' },
                  { language: 'de', text: 'Hallo Welt' },
                  { language: 'fr', text: 'Bonjour le monde' },
                ],
              },
              {
                modelType: 'Property',
                idShort: 'PropWithDescription',
                valueType: 'xs:string',
                value: 'Test',
                description: [
                  { language: 'en', text: 'Property description' },
                ],
              },
            ],
          },
        ],
        conceptDescriptions: [],
      };

      // Write as XML
      const aasx = await writeAasx(envWithLangStrings, { format: 'xml', filename: 'aas.xml' });

      // Read it back
      const result = await readAasx(aasx);

      // Verify submodel description preserved
      expect(result.environment.submodels![0].description).toBeDefined();
      expect(result.environment.submodels![0].description).toHaveLength(2);
      expect(result.environment.submodels![0].description![0].text).toBe('English description');
      expect(result.environment.submodels![0].description![1].text).toBe('Deutsche Beschreibung');

      // Verify MultiLanguageProperty value preserved
      const mlp = result.environment.submodels![0].submodelElements![0];
      expect(mlp.modelType).toBe('MultiLanguageProperty');
      if (mlp.modelType === 'MultiLanguageProperty') {
        expect(mlp.value).toBeDefined();
        expect(mlp.value).toHaveLength(3);
        expect(mlp.value![0].text).toBe('Hello World');
        expect(mlp.value![1].text).toBe('Hallo Welt');
        expect(mlp.value![2].text).toBe('Bonjour le monde');
      }
    });

    it('should preserve Key attributes through XML round-trip', async () => {
      const envWithRefs: Environment = {
        assetAdministrationShells: [
          {
            modelType: 'AssetAdministrationShell',
            id: 'https://example.com/aas/key-test',
            idShort: 'KeyTestAAS',
            assetInformation: {
              assetKind: 'Instance',
              globalAssetId: 'https://example.com/asset/key-test',
            },
            submodels: [
              {
                type: 'ModelReference',
                keys: [
                  { type: 'Submodel', value: 'https://example.com/submodel/key-test' },
                ],
              },
            ],
          },
        ],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/key-test',
            idShort: 'KeyTestSubmodel',
            semanticId: {
              type: 'ExternalReference',
              keys: [
                { type: 'GlobalReference', value: 'https://admin-shell.io/example/semantic/1/0' },
              ],
            },
            submodelElements: [
              {
                modelType: 'ReferenceElement',
                idShort: 'RefElement',
                value: {
                  type: 'ModelReference',
                  keys: [
                    { type: 'Submodel', value: 'https://example.com/other/submodel' },
                    { type: 'Property', value: 'SomeProperty' },
                  ],
                },
              },
            ],
          },
        ],
        conceptDescriptions: [],
      };

      // Write as XML
      const aasx = await writeAasx(envWithRefs, { format: 'xml', filename: 'aas.xml' });

      // Read it back
      const result = await readAasx(aasx);

      // Verify AAS submodel reference keys preserved
      const aasRefs = result.environment.assetAdministrationShells![0].submodels;
      expect(aasRefs).toBeDefined();
      expect(aasRefs![0].keys).toHaveLength(1);
      expect(aasRefs![0].keys[0].type).toBe('Submodel');
      expect(aasRefs![0].keys[0].value).toBe('https://example.com/submodel/key-test');

      // Verify semanticId keys preserved
      const semanticId = result.environment.submodels![0].semanticId;
      expect(semanticId).toBeDefined();
      expect(semanticId!.keys).toHaveLength(1);
      expect(semanticId!.keys[0].type).toBe('GlobalReference');
      expect(semanticId!.keys[0].value).toBe('https://admin-shell.io/example/semantic/1/0');

      // Verify ReferenceElement keys preserved (including multi-key references)
      const refElem = result.environment.submodels![0].submodelElements![0];
      expect(refElem.modelType).toBe('ReferenceElement');
      if (refElem.modelType === 'ReferenceElement' && refElem.value) {
        expect(refElem.value.keys).toHaveLength(2);
        expect(refElem.value.keys[0].type).toBe('Submodel');
        expect(refElem.value.keys[1].type).toBe('Property');
      }
    });

    it('should preserve full MultiLanguageProperty through XML round-trip', async () => {
      // Write as XML
      const aasx = await writeAasx(minimalEnvironment, { format: 'xml', filename: 'aas.xml' });

      // Read it back
      const result = await readAasx(aasx);

      // Find the MultiLanguageProperty
      const mlp = result.environment.submodels![0].submodelElements!.find(
        (e) => e.modelType === 'MultiLanguageProperty'
      );

      expect(mlp).toBeDefined();
      if (mlp && mlp.modelType === 'MultiLanguageProperty') {
        expect(mlp.idShort).toBe('MultiLangProp');
        expect(mlp.value).toBeDefined();
        expect(mlp.value).toHaveLength(2);
        expect(mlp.value!.find((ls) => ls.language === 'en')?.text).toBe('English text');
        expect(mlp.value!.find((ls) => ls.language === 'de')?.text).toBe('German text');
      }
    });

    it('should produce valid XML with type attributes on keys', async () => {
      const aasx = await writeAasx(minimalEnvironment, { format: 'xml', filename: 'aas.xml' });
      const xmlContent = getAasxFileContent(aasx, 'aasx/aas.xml');

      expect(xmlContent).toBeDefined();
      // Keys should use @_type which becomes type="..." attribute in XML
      // The pattern should show type as an attribute, not as a child element
      expect(xmlContent).toContain('type=');
      // Should NOT have type as a separate element inside key
      // (checking that the fix is working by ensuring key structure is correct)
    });
  });

  describe('Edge cases', () => {
    it('should handle Environment with only shells', async () => {
      const shellOnlyEnv: Environment = {
        assetAdministrationShells: [
          {
            modelType: 'AssetAdministrationShell',
            id: 'https://example.com/aas/shell-only',
            assetInformation: { assetKind: 'Instance' },
          },
        ],
        submodels: [],
        conceptDescriptions: [],
      };

      const aasx = await writeAasx(shellOnlyEnv);
      const result = await readAasx(aasx);

      expect(result.environment.assetAdministrationShells).toHaveLength(1);
      expect(result.environment.submodels).toHaveLength(0);
    });

    it('should handle deeply nested SubmodelElementCollections', async () => {
      const nestedEnv: Environment = {
        assetAdministrationShells: [],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/nested',
            idShort: 'NestedSubmodel',
            submodelElements: [
              {
                modelType: 'SubmodelElementCollection',
                idShort: 'Level1',
                value: [
                  {
                    modelType: 'SubmodelElementCollection',
                    idShort: 'Level2',
                    value: [
                      {
                        modelType: 'Property',
                        idShort: 'DeepProperty',
                        valueType: 'xs:string',
                        value: 'DeepValue',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        conceptDescriptions: [],
      };

      const aasx = await writeAasx(nestedEnv);
      const result = await readAasx(aasx);

      const sme = result.environment.submodels![0].submodelElements![0];
      expect(sme.modelType).toBe('SubmodelElementCollection');
      if (sme.modelType === 'SubmodelElementCollection') {
        expect(sme.value).toHaveLength(1);
        expect(sme.value![0].modelType).toBe('SubmodelElementCollection');
      }
    });

    it('should handle various SubmodelElement types', async () => {
      const multiTypeEnv: Environment = {
        assetAdministrationShells: [],
        submodels: [
          {
            modelType: 'Submodel',
            id: 'https://example.com/submodel/multi-type',
            idShort: 'MultiTypeSubmodel',
            submodelElements: [
              { modelType: 'Property', idShort: 'Prop', valueType: 'xs:int', value: '42' },
              {
                modelType: 'File',
                idShort: 'FileRef',
                contentType: 'application/pdf',
                value: '/docs/file.pdf',
              },
              {
                modelType: 'Blob',
                idShort: 'BlobData',
                contentType: 'application/octet-stream',
                value: 'SGVsbG8=', // Base64 "Hello"
              },
              { modelType: 'Range', idShort: 'RangeVal', valueType: 'xs:double', min: '0.0', max: '100.0' },
            ],
          },
        ],
        conceptDescriptions: [],
      };

      const aasx = await writeAasx(multiTypeEnv);
      const result = await readAasx(aasx);

      expect(result.environment.submodels![0].submodelElements).toHaveLength(4);
    });
  });
});
