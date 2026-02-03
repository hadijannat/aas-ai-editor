import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readAasx } from '../../src/aasx/reader.js';
import type { Environment } from '../../src/aas/types.js';

/**
 * Helper to create a minimal AASX package for testing
 */
function createTestAasx(options: {
  aasJson?: Environment;
  aasXml?: string;
  aasFilename?: string;
  contentTypes?: string;
  rels?: string;
  supplementaryFiles?: Record<string, Uint8Array | string>;
  skipContentTypes?: boolean;
  skipRels?: boolean;
}): Uint8Array {
  const {
    aasJson,
    aasXml,
    aasFilename = 'aasx/aas.json',
    contentTypes,
    rels,
    supplementaryFiles = {},
    skipContentTypes = false,
    skipRels = false,
  } = options;

  const files: Record<string, Uint8Array> = {};

  // Add [Content_Types].xml
  if (!skipContentTypes) {
    const ct =
      contentTypes ||
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="pdf" ContentType="application/pdf"/>
</Types>`;
    files['[Content_Types].xml'] = strToU8(ct);
  }

  // Add _rels/.rels
  if (!skipRels) {
    const r =
      rels ||
      `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/${aasFilename}"/>
</Relationships>`;
    files['_rels/.rels'] = strToU8(r);
  }

  // Add AAS file
  if (aasJson) {
    files[aasFilename] = strToU8(JSON.stringify(aasJson));
  } else if (aasXml) {
    files[aasFilename.replace('.json', '.xml')] = strToU8(aasXml);
  }

  // Add supplementary files
  for (const [path, content] of Object.entries(supplementaryFiles)) {
    files[path] = typeof content === 'string' ? strToU8(content) : content;
  }

  return zipSync(files);
}

/**
 * Minimal valid AAS Environment
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
      ],
    },
  ],
  conceptDescriptions: [],
};

describe('AASX Reader', () => {
  describe('readAasx', () => {
    it('should read a valid AASX with JSON AAS', async () => {
      const aasx = createTestAasx({ aasJson: minimalEnvironment });
      const result = await readAasx(aasx);

      expect(result.environment).toBeDefined();
      expect(result.environment.assetAdministrationShells).toHaveLength(1);
      expect(result.environment.assetAdministrationShells![0].id).toBe('https://example.com/aas/1');
      expect(result.environment.submodels).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return the filename from the AAS path', async () => {
      const aasx = createTestAasx({
        aasJson: minimalEnvironment,
        aasFilename: 'aasx/my-custom-aas.json',
      });
      const result = await readAasx(aasx);

      expect(result.filename).toBe('my-custom-aas.json');
    });

    it('should extract supplementary files', async () => {
      const thumbnail = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      const aasx = createTestAasx({
        aasJson: minimalEnvironment,
        supplementaryFiles: {
          'supplementary/thumbnail.png': thumbnail,
        },
      });
      const result = await readAasx(aasx);

      expect(result.supplementaryFiles.size).toBe(1);
      expect(result.supplementaryFiles.has('supplementary/thumbnail.png')).toBe(true);
      expect(result.supplementaryFiles.get('supplementary/thumbnail.png')).toEqual(thumbnail);
    });

    it('should handle missing [Content_Types].xml with warning', async () => {
      const aasx = createTestAasx({
        aasJson: minimalEnvironment,
        skipContentTypes: true,
      });
      const result = await readAasx(aasx);

      expect(result.environment).toBeDefined();
      expect(result.warnings.some((w) => w.includes('[Content_Types].xml'))).toBe(true);
    });

    it('should handle missing _rels/.rels with warning and fallback', async () => {
      const aasx = createTestAasx({
        aasJson: minimalEnvironment,
        skipRels: true,
      });
      const result = await readAasx(aasx);

      expect(result.environment).toBeDefined();
      expect(result.warnings.some((w) => w.includes('_rels/.rels'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('aas-spec relationship'))).toBe(true);
    });

    it('should find AAS file by extension when relationships missing', async () => {
      const files: Record<string, Uint8Array> = {
        'aasx/environment.json': strToU8(JSON.stringify(minimalEnvironment)),
        '[Content_Types].xml': strToU8(`<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
</Types>`),
      };
      const aasx = zipSync(files);
      const result = await readAasx(aasx);

      expect(result.environment).toBeDefined();
      expect(result.environment.assetAdministrationShells).toHaveLength(1);
    });

    it('should respect maxSize option', async () => {
      const aasx = createTestAasx({ aasJson: minimalEnvironment });

      await expect(readAasx(aasx, { maxSize: 100 })).rejects.toThrow('exceeds maximum size');
    });

    it('should throw on invalid ZIP', async () => {
      const invalidData = new Uint8Array([1, 2, 3, 4, 5]);

      await expect(readAasx(invalidData)).rejects.toThrow('Failed to unzip');
    });

    it('should throw when no AAS file found', async () => {
      const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`),
        '_rels/.rels': strToU8(`<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`),
      };
      const aasx = zipSync(files);

      await expect(readAasx(aasx)).rejects.toThrow('No AAS specification file found');
    });

    it('should throw on invalid JSON in AAS file', async () => {
      const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
</Types>`),
        '_rels/.rels': strToU8(`<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/aasx/aas.json"/>
</Relationships>`),
        'aasx/aas.json': strToU8('{ invalid json }'),
      };
      const aasx = zipSync(files);

      await expect(readAasx(aasx)).rejects.toThrow('Failed to parse AAS file');
    });

    it('should handle ArrayBuffer input', async () => {
      const aasx = createTestAasx({ aasJson: minimalEnvironment });
      const arrayBuffer = aasx.buffer.slice(aasx.byteOffset, aasx.byteOffset + aasx.byteLength);
      const result = await readAasx(arrayBuffer);

      expect(result.environment).toBeDefined();
    });

    it('should ensure arrays exist even if missing from source', async () => {
      const emptyEnv = {};
      const aasx = createTestAasx({ aasJson: emptyEnv as Environment });
      const result = await readAasx(aasx);

      expect(result.environment.assetAdministrationShells).toEqual([]);
      expect(result.environment.submodels).toEqual([]);
      expect(result.environment.conceptDescriptions).toEqual([]);
    });
  });

  describe('readAasx with XML format', () => {
    it('should read a valid AASX with XML AAS', async () => {
      const aasXml = `<?xml version="1.0" encoding="utf-8"?>
<environment xmlns="https://admin-shell.io/aas/3/0">
  <assetAdministrationShells>
    <assetAdministrationShell>
      <id>https://example.com/aas/xml/1</id>
      <idShort>XmlTestAAS</idShort>
      <assetInformation>
        <assetKind>Instance</assetKind>
        <globalAssetId>https://example.com/asset/xml/1</globalAssetId>
      </assetInformation>
    </assetAdministrationShell>
  </assetAdministrationShells>
  <submodels>
    <submodel>
      <id>https://example.com/submodel/xml/1</id>
      <idShort>XmlTestSubmodel</idShort>
      <submodelElements>
        <submodelElement>
          <modelType>Property</modelType>
          <idShort>XmlProperty</idShort>
          <valueType>xs:string</valueType>
          <value>XmlValue</value>
        </submodelElement>
      </submodelElements>
    </submodel>
  </submodels>
</environment>`;

      const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/aasx/aas.xml"/>
</Relationships>`;

      const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`),
        '_rels/.rels': strToU8(rels),
        'aasx/aas.xml': strToU8(aasXml),
      };
      const aasx = zipSync(files);
      const result = await readAasx(aasx);

      expect(result.environment).toBeDefined();
      expect(result.environment.assetAdministrationShells).toHaveLength(1);
      expect(result.environment.assetAdministrationShells![0].id).toBe('https://example.com/aas/xml/1');
    });
  });

  describe('OPC relationship handling', () => {
    it('should collect files marked as supplementary in relationships', async () => {
      const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/aasx/aas.json"/>
  <Relationship Id="rId2" Type="http://admin-shell.io/aasx/relationships/aas-suppl" Target="/supplementary/doc.pdf"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="/thumbnail.png"/>
</Relationships>`;

      const thumbnail = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

      const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="pdf" ContentType="application/pdf"/>
</Types>`),
        '_rels/.rels': strToU8(rels),
        'aasx/aas.json': strToU8(JSON.stringify(minimalEnvironment)),
        'supplementary/doc.pdf': pdf,
        'thumbnail.png': thumbnail,
      };
      const aasx = zipSync(files);
      const result = await readAasx(aasx);

      expect(result.supplementaryFiles.size).toBe(2);
      expect(result.supplementaryFiles.has('supplementary/doc.pdf')).toBe(true);
      expect(result.supplementaryFiles.has('thumbnail.png')).toBe(true);
    });

    it('should warn when supplementary file in relationships is missing', async () => {
      const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/aasx/aas.json"/>
  <Relationship Id="rId2" Type="http://admin-shell.io/aasx/relationships/aas-suppl" Target="/missing/file.pdf"/>
</Relationships>`;

      const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(`<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
</Types>`),
        '_rels/.rels': strToU8(rels),
        'aasx/aas.json': strToU8(JSON.stringify(minimalEnvironment)),
      };
      const aasx = zipSync(files);
      const result = await readAasx(aasx);

      expect(result.warnings.some((w) => w.includes('Supplementary file not found'))).toBe(true);
    });
  });
});
