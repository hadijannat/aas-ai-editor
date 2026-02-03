import { describe, it, expect } from 'vitest';
import { validatePatchOp, ApprovalTier } from '../../src/patch/schema.js';
import type { AasPatchOp } from '../../src/patch/schema.js';

describe('Patch Schema', () => {
  describe('validatePatchOp', () => {
    it('should accept valid replace operation', () => {
      const patch: AasPatchOp = {
        op: 'replace',
        path: '/submodels/0/submodelElements/0/value',
        value: 'NewValue',
      };

      expect(validatePatchOp(patch)).toBeNull();
    });

    it('should accept valid add operation', () => {
      const patch: AasPatchOp = {
        op: 'add',
        path: '/submodels/0/submodelElements/-',
        value: { modelType: 'Property', idShort: 'NewProp' },
      };

      expect(validatePatchOp(patch)).toBeNull();
    });

    it('should accept valid remove operation', () => {
      const patch: AasPatchOp = {
        op: 'remove',
        path: '/submodels/0/submodelElements/0',
      };

      expect(validatePatchOp(patch)).toBeNull();
    });

    it('should reject operation without op', () => {
      const patch = {
        path: '/submodels/0',
        value: 'test',
      } as AasPatchOp;

      expect(validatePatchOp(patch)).toContain('op');
    });

    it('should reject operation without path', () => {
      const patch = {
        op: 'replace',
        value: 'test',
      } as AasPatchOp;

      expect(validatePatchOp(patch)).toContain('path');
    });

    it('should reject replace without value', () => {
      const patch: AasPatchOp = {
        op: 'replace',
        path: '/submodels/0',
      };

      expect(validatePatchOp(patch)).toContain('value');
    });

    it('should reject move without from', () => {
      const patch: AasPatchOp = {
        op: 'move',
        path: '/submodels/0',
      };

      expect(validatePatchOp(patch)).toContain('from');
    });

    it('should reject invalid path format', () => {
      const patch: AasPatchOp = {
        op: 'replace',
        path: 'submodels/0', // Missing leading slash
        value: 'test',
      };

      expect(validatePatchOp(patch)).toContain('JSON Pointer');
    });
  });

  describe('ApprovalTier', () => {
    it('should have correct numeric values for ordering', () => {
      expect(ApprovalTier.LOW).toBeLessThan(ApprovalTier.MEDIUM);
      expect(ApprovalTier.MEDIUM).toBeLessThan(ApprovalTier.HIGH);
      expect(ApprovalTier.HIGH).toBeLessThan(ApprovalTier.CRITICAL);
    });
  });
});
