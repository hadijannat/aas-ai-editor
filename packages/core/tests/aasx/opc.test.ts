import { describe, it, expect } from 'vitest';
import {
  parseContentTypes,
  parseOpcRelationships,
  generateContentTypes,
  generateOpcRelationships,
  findAasSpecPath,
  getContentTypeForPath,
  isJsonContentType,
  isXmlContentType,
  OPC_RELATIONSHIP_TYPES,
} from '../../src/aasx/opc.js';

describe('OPC Utilities', () => {
  describe('parseContentTypes', () => {
    it('should parse Default elements', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`;

      const result = parseContentTypes(xml);

      expect(result.defaults).toHaveLength(2);
      expect(result.defaults[0]).toEqual({ extension: 'json', contentType: 'application/json' });
      expect(result.defaults[1]).toEqual({ extension: 'xml', contentType: 'application/xml' });
    });

    it('should parse Override elements', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/aasx/aas.json" ContentType="application/asset-administration-shell-package+json"/>
</Types>`;

      const result = parseContentTypes(xml);

      expect(result.overrides).toHaveLength(1);
      expect(result.overrides[0]).toEqual({
        partName: '/aasx/aas.json',
        contentType: 'application/asset-administration-shell-package+json',
      });
    });

    it('should handle mixed Default and Override elements', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Override PartName="/aasx/aas.json" ContentType="application/asset-administration-shell-package+json"/>
</Types>`;

      const result = parseContentTypes(xml);

      expect(result.defaults).toHaveLength(1);
      expect(result.overrides).toHaveLength(1);
    });

    it('should return empty arrays for invalid XML', () => {
      const result = parseContentTypes('not xml');

      expect(result.defaults).toEqual([]);
      expect(result.overrides).toEqual([]);
    });

    it('should handle single element (not array)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
</Types>`;

      const result = parseContentTypes(xml);

      expect(result.defaults).toHaveLength(1);
    });
  });

  describe('parseOpcRelationships', () => {
    it('should parse relationship elements', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/aasx/aas.json"/>
  <Relationship Id="rId2" Type="http://admin-shell.io/aasx/relationships/aas-suppl" Target="/supplementary/doc.pdf"/>
</Relationships>`;

      const result = parseOpcRelationships(xml);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'rId1',
        type: 'http://admin-shell.io/aasx/relationships/aas-spec',
        target: '/aasx/aas.json',
        targetMode: undefined,
      });
    });

    it('should parse TargetMode attribute', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://example.com/rel" Target="http://external.com/file" TargetMode="External"/>
</Relationships>`;

      const result = parseOpcRelationships(xml);

      expect(result[0].targetMode).toBe('External');
    });

    it('should return empty array for missing Relationships', () => {
      const xml = `<?xml version="1.0"?><Empty/>`;
      const result = parseOpcRelationships(xml);

      expect(result).toEqual([]);
    });
  });

  describe('findAasSpecPath', () => {
    it('should find aas-spec relationship target', () => {
      const relationships = [
        { id: 'rId1', type: OPC_RELATIONSHIP_TYPES.AAS_SPEC, target: '/aasx/env.json' },
        { id: 'rId2', type: OPC_RELATIONSHIP_TYPES.THUMBNAIL, target: '/thumb.png' },
      ];

      expect(findAasSpecPath(relationships)).toBe('/aasx/env.json');
    });

    it('should return undefined when no aas-spec relationship', () => {
      const relationships = [
        { id: 'rId1', type: OPC_RELATIONSHIP_TYPES.THUMBNAIL, target: '/thumb.png' },
      ];

      expect(findAasSpecPath(relationships)).toBeUndefined();
    });

    it('should return undefined for empty array', () => {
      expect(findAasSpecPath([])).toBeUndefined();
    });
  });

  describe('getContentTypeForPath', () => {
    const contentTypes = {
      defaults: [
        { extension: 'json', contentType: 'application/json' },
        { extension: 'xml', contentType: 'application/xml' },
      ],
      overrides: [{ partName: '/aasx/aas.json', contentType: 'application/aas+json' }],
    };

    it('should prioritize overrides over defaults', () => {
      expect(getContentTypeForPath('/aasx/aas.json', contentTypes)).toBe('application/aas+json');
    });

    it('should fall back to extension-based default', () => {
      expect(getContentTypeForPath('/other/file.json', contentTypes)).toBe('application/json');
    });

    it('should handle paths without leading slash', () => {
      expect(getContentTypeForPath('aasx/aas.json', contentTypes)).toBe('application/aas+json');
    });

    it('should return undefined for unknown extension', () => {
      expect(getContentTypeForPath('/file.unknown', contentTypes)).toBeUndefined();
    });

    it('should be case-insensitive for extensions', () => {
      expect(getContentTypeForPath('/file.JSON', contentTypes)).toBe('application/json');
    });
  });

  describe('isJsonContentType', () => {
    it('should return true for JSON content types', () => {
      expect(isJsonContentType('application/json')).toBe(true);
      expect(isJsonContentType('application/asset-administration-shell-package+json')).toBe(true);
      expect(isJsonContentType('text/json')).toBe(true);
    });

    it('should return false for non-JSON content types', () => {
      expect(isJsonContentType('application/xml')).toBe(false);
      expect(isJsonContentType('text/plain')).toBe(false);
    });
  });

  describe('isXmlContentType', () => {
    it('should return true for XML content types', () => {
      expect(isXmlContentType('application/xml')).toBe(true);
      expect(isXmlContentType('application/asset-administration-shell-package+xml')).toBe(true);
      expect(isXmlContentType('text/xml')).toBe(true);
    });

    it('should return false for non-XML content types', () => {
      expect(isXmlContentType('application/json')).toBe(false);
      expect(isXmlContentType('text/plain')).toBe(false);
    });
  });

  describe('generateContentTypes', () => {
    it('should generate valid [Content_Types].xml', () => {
      const contentTypes = {
        defaults: [{ extension: 'json', contentType: 'application/json' }],
        overrides: [{ partName: '/aasx/aas.json', contentType: 'application/aas+json' }],
      };

      const xml = generateContentTypes(contentTypes);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">');
      expect(xml).toContain('<Default Extension="json" ContentType="application/json"/>');
      expect(xml).toContain('<Override PartName="/aasx/aas.json" ContentType="application/aas+json"/>');
    });
  });

  describe('generateOpcRelationships', () => {
    it('should generate valid .rels XML', () => {
      const relationships = [
        { id: 'rId1', type: OPC_RELATIONSHIP_TYPES.AAS_SPEC, target: '/aasx/aas.json' },
      ];

      const xml = generateOpcRelationships(relationships);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">');
      expect(xml).toContain('Id="rId1"');
      expect(xml).toContain('Target="/aasx/aas.json"');
    });

    it('should include TargetMode when specified', () => {
      const relationships = [
        { id: 'rId1', type: 'http://example.com', target: 'http://ext.com', targetMode: 'External' as const },
      ];

      const xml = generateOpcRelationships(relationships);

      expect(xml).toContain('TargetMode="External"');
    });
  });
});
