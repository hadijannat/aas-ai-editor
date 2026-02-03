import { describe, it, expect } from 'vitest';
import {
  selectSubmodelBySemanticId,
  selectSmeByIdShort,
  selectSmeByPath,
  getElementPath,
} from '../../src/aas/selectors.js';
import type { Environment } from '../../src/aas/types.js';
import sampleEnv from '../fixtures/sample-environment.json';

describe('AAS Selectors', () => {
  const env = sampleEnv as Environment;

  describe('selectSubmodelBySemanticId', () => {
    it('should find submodel by semantic ID', () => {
      const submodel = selectSubmodelBySemanticId(
        env,
        'https://admin-shell.io/zvei/nameplate/2/0/Nameplate'
      );

      expect(submodel).toBeDefined();
      expect(submodel?.idShort).toBe('Nameplate');
    });

    it('should return undefined for unknown semantic ID', () => {
      const submodel = selectSubmodelBySemanticId(env, 'https://unknown.com/does-not-exist');

      expect(submodel).toBeUndefined();
    });
  });

  describe('selectSmeByIdShort', () => {
    it('should find element by idShort', () => {
      const submodel = env.submodels![0];
      const element = selectSmeByIdShort(submodel, 'ManufacturerName');

      expect(element).toBeDefined();
      expect(element?.modelType).toBe('Property');
    });

    it('should return undefined for unknown idShort', () => {
      const submodel = env.submodels![0];
      const element = selectSmeByIdShort(submodel, 'DoesNotExist');

      expect(element).toBeUndefined();
    });
  });

  describe('selectSmeByPath', () => {
    it('should find nested element by path', () => {
      const submodel = env.submodels![0];
      const element = selectSmeByPath(submodel, 'ContactInformation.Street');

      expect(element).toBeDefined();
      expect(element?.idShort).toBe('Street');
    });

    it('should find top-level element by simple path', () => {
      const submodel = env.submodels![0];
      const element = selectSmeByPath(submodel, 'ManufacturerName');

      expect(element).toBeDefined();
    });

    it('should return undefined for invalid path', () => {
      const submodel = env.submodels![0];
      const element = selectSmeByPath(submodel, 'Invalid.Deep.Path');

      expect(element).toBeUndefined();
    });
  });

  describe('getElementPath', () => {
    it('should return JSON Pointer path for element', () => {
      const path = getElementPath(
        env,
        'https://example.com/submodel/nameplate',
        'ManufacturerName'
      );

      expect(path).toBe('/submodels/0/submodelElements/0');
    });

    it('should return path for nested element', () => {
      const path = getElementPath(
        env,
        'https://example.com/submodel/nameplate',
        'ContactInformation.Street'
      );

      expect(path).toBe('/submodels/0/submodelElements/2/value/0');
    });

    it('should return undefined for unknown submodel', () => {
      const path = getElementPath(env, 'https://unknown.com/submodel', 'Anything');

      expect(path).toBeUndefined();
    });
  });
});
