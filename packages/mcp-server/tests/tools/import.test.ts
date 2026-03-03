/**
 * Tests for Import Tools
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importTools } from '../../src/tools/import.js';
import {
  createEmptySession,
  createMockSession,
  createMockToolContext,
  sampleEnvironment,
} from './test-helpers.js';
import type { SessionData } from '../../src/types.js';

const { getDocumentMock, workerOptions } = vi.hoisted(() => ({
  getDocumentMock: vi.fn(),
  workerOptions: { workerSrc: 'preset-worker' },
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: workerOptions,
  getDocument: getDocumentMock,
}));

const importPdf = importTools.find((tool) => tool.name === 'import_pdf')!;

function toPageItems(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((str) => ({ str }));
}

function mockPdfDocument(pageText: Record<number, string>, numPages: number) {
  const getPage = vi.fn(async (pageNumber: number) => ({
    getTextContent: vi.fn(async () => ({
      items: toPageItems(pageText[pageNumber] ?? ''),
    })),
  }));

  getDocumentMock.mockReturnValue({
    promise: Promise.resolve({
      numPages,
      getPage,
    }),
  });

  return { getPage };
}

describe('Import Tools', () => {
  let session: SessionData;

  beforeEach(() => {
    session = createMockSession(structuredClone(sampleEnvironment));
    getDocumentMock.mockReset();
    workerOptions.workerSrc = 'preset-worker';
  });

  describe('import_pdf', () => {
    it('maps extracted fields to replace and add patches for a target submodel', async () => {
      mockPdfDocument(
        {
          1: 'Manufacturer: Acme Dynamics, Serial Number: SN-4242',
        },
        1
      );

      const context = createMockToolContext(session);
      const result = await importPdf.handler(
        {
          base64Content: Buffer.from('fake-pdf').toString('base64'),
          targetSubmodel: 'Nameplate',
        },
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as any;

      expect(data.pageCount).toBe(1);
      expect(data.extractedFields.ManufacturerName).toBe('Acme Dynamics');
      expect(data.extractedFields.SerialNumber).toBe('SN-4242');

      expect(data.suggestedPatches).toContainEqual(
        expect.objectContaining({
          op: 'replace',
          path: '/submodels/0/submodelElements/0/value',
          value: 'Acme Dynamics',
          confidence: 0.7,
        })
      );

      expect(data.suggestedPatches).toContainEqual(
        expect.objectContaining({
          op: 'add',
          path: '/submodels/0/submodelElements/-',
          value: expect.objectContaining({
            modelType: 'Property',
            idShort: 'SerialNumber',
            valueType: 'xs:string',
            value: 'SN-4242',
          }),
          confidence: 0.6,
        })
      );

      expect(workerOptions.workerSrc).toBe('');
    });

    it('filters invalid page inputs and processes only valid pages', async () => {
      const { getPage } = mockPdfDocument(
        {
          1: 'Manufacturer: Ignored Corp',
          2: 'Serial Number: SN-2000',
          3: 'Manufacturer: Another Corp',
        },
        3
      );

      const context = createMockToolContext(createEmptySession());
      const result = await importPdf.handler(
        {
          base64Content: Buffer.from('fake-pdf').toString('base64'),
          pages: [2, 0, 99],
        },
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as any;

      expect(data.pageCount).toBe(1);
      expect(data.extractedFields.SerialNumber).toBe('SN-2000');
      expect(getPage).toHaveBeenCalledTimes(1);
      expect(getPage).toHaveBeenCalledWith(2);
    });

    it('wraps pdfjs errors with import_pdf context', async () => {
      getDocumentMock.mockReturnValue({
        promise: Promise.reject(new Error('boom')),
      });

      const context = createMockToolContext(createEmptySession());
      const result = await importPdf.handler(
        {
          base64Content: Buffer.from('fake-pdf').toString('base64'),
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('PDF import failed: boom');
    });
  });
});
