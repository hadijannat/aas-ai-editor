/**
 * Input Validation Tests
 */

import { describe, it, expect } from 'vitest';
import { validateToolInput, createInputValidator, schemas } from '../../src/security/validation.js';

describe('Input Validation', () => {
  describe('schemas', () => {
    describe('sessionId', () => {
      it('should accept valid UUIDs', () => {
        const result = schemas.sessionId.safeParse('550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(true);
      });

      it('should reject invalid UUIDs', () => {
        const result = schemas.sessionId.safeParse('not-a-uuid');
        expect(result.success).toBe(false);
      });
    });

    describe('filePath', () => {
      it('should accept valid paths', () => {
        const result = schemas.filePath.safeParse('/path/to/file.aasx');
        expect(result.success).toBe(true);
      });

      it('should reject empty paths', () => {
        const result = schemas.filePath.safeParse('');
        expect(result.success).toBe(false);
      });
    });

    describe('jsonPointer', () => {
      it('should accept valid JSON pointers', () => {
        expect(schemas.jsonPointer.safeParse('/submodels/0').success).toBe(true);
        expect(schemas.jsonPointer.safeParse('').success).toBe(true);
        expect(schemas.jsonPointer.safeParse('/a/b/c').success).toBe(true);
      });

      it('should accept JSON pointers with escaped characters', () => {
        expect(schemas.jsonPointer.safeParse('/a~0b').success).toBe(true);
        expect(schemas.jsonPointer.safeParse('/a~1b').success).toBe(true);
      });
    });

    describe('filename', () => {
      it('should accept valid filenames', () => {
        expect(schemas.filename.safeParse('document.aasx').success).toBe(true);
        expect(schemas.filename.safeParse('my-file_v1.2.json').success).toBe(true);
      });

      it('should reject filenames with path separators', () => {
        expect(schemas.filename.safeParse('path/to/file.aasx').success).toBe(false);
        expect(schemas.filename.safeParse('..\\file.aasx').success).toBe(false);
      });

      it('should reject empty filenames', () => {
        expect(schemas.filename.safeParse('').success).toBe(false);
      });
    });
  });

  describe('validateToolInput', () => {
    describe('document_load', () => {
      it('should validate correct input', () => {
        const result = validateToolInput('document_load', {
          path: '/path/to/file.aasx',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject missing path', () => {
        const result = validateToolInput('document_load', {});
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
      });
    });

    describe('document_load_content', () => {
      it('should validate correct input', () => {
        const result = validateToolInput('document_load_content', {
          content: 'SGVsbG8gV29ybGQ=',
          filename: 'test.aasx',
        });
        expect(result.valid).toBe(true);
      });

      it('should reject invalid base64', () => {
        const result = validateToolInput('document_load_content', {
          content: 'not valid base64!!!',
          filename: 'test.aasx',
        });
        expect(result.valid).toBe(false);
      });

      it('should reject filename with path separators', () => {
        const result = validateToolInput('document_load_content', {
          content: 'SGVsbG8gV29ybGQ=',
          filename: '../../../etc/passwd',
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('edit_add', () => {
      it('should validate correct input', () => {
        const result = validateToolInput('edit_add', {
          path: '/submodels/0/submodelElements/-',
          value: { idShort: 'NewProperty' },
        });
        expect(result.valid).toBe(true);
      });

      it('should require path', () => {
        const result = validateToolInput('edit_add', {
          value: { idShort: 'NewProperty' },
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('validate_auto_fix', () => {
      it('should validate correct input', () => {
        const result = validateToolInput('validate_auto_fix', {
          maxIterations: 5,
          autoApprove: false,
        });
        expect(result.valid).toBe(true);
      });

      it('should reject maxIterations > 10', () => {
        const result = validateToolInput('validate_auto_fix', {
          maxIterations: 100,
        });
        expect(result.valid).toBe(false);
      });

      it('should accept empty input for optional params', () => {
        const result = validateToolInput('validate_auto_fix', {});
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('createInputValidator', () => {
    it('should return pass-through validator for unknown tools', () => {
      const validator = createInputValidator('unknown_tool');
      const result = validator.validate({ anything: 'goes' });
      expect(result.valid).toBe(true);
    });

    it('should create validators for known tools', () => {
      const validator = createInputValidator('document_load');
      expect(validator.schema).toBeDefined();
    });
  });
});
