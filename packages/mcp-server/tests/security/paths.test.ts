/**
 * Path Security Tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import {
  isPathSafe,
  validatePath,
  createPathValidator,
  loadAllowedDirectoriesFromEnv,
} from '../../src/security/paths.js';

describe('Path Security', () => {
  describe('isPathSafe', () => {
    it('should accept normal paths', () => {
      expect(isPathSafe('/home/user/documents/file.aasx')).toBe(true);
      expect(isPathSafe('./file.json')).toBe(true);
      expect(isPathSafe('file.aasx')).toBe(true);
    });

    it('should reject paths with directory traversal', () => {
      expect(isPathSafe('../secret/file')).toBe(false);
      expect(isPathSafe('/home/../etc/passwd')).toBe(false);
      expect(isPathSafe('../../file')).toBe(false);
    });

    it('should reject paths with null bytes', () => {
      expect(isPathSafe('/path/to/file\0.txt')).toBe(false);
    });

    it('should reject URL-encoded traversal', () => {
      expect(isPathSafe('/path%2f..%2fsecret')).toBe(false);
      expect(isPathSafe('%2e%2e/etc/passwd')).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should accept paths within allowed directories', () => {
      const result = validatePath('/tmp/test/file.aasx', {
        allowedDirectories: ['/tmp'],
        strictMode: true,
      });
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe('/tmp/test/file.aasx');
    });

    it('should reject paths outside allowed directories', () => {
      const result = validatePath('/etc/passwd', {
        allowedDirectories: ['/tmp'],
        strictMode: true,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside allowed directories');
    });

    it('should reject traversal attempts', () => {
      const result = validatePath('/tmp/../etc/passwd', {
        allowedDirectories: ['/tmp'],
        strictMode: true,
      });
      expect(result.valid).toBe(false);
    });

    it('should allow any path when strictMode is false', () => {
      const result = validatePath('/etc/passwd', {
        allowedDirectories: ['/tmp'],
        strictMode: false,
      });
      expect(result.valid).toBe(true);
    });

    it('should reject paths exceeding max length', () => {
      const longPath = '/tmp/' + 'a'.repeat(5000);
      const result = validatePath(longPath, {
        maxPathLength: 4096,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });
  });

  describe('createPathValidator', () => {
    it('should create a reusable validator', () => {
      const validator = createPathValidator({
        allowedDirectories: ['/tmp'],
        strictMode: true,
      });

      expect(validator.isAllowed('/tmp/file.aasx')).toBe(true);
      expect(validator.isAllowed('/etc/passwd')).toBe(false);
    });

    it('should normalize paths correctly', () => {
      const validator = createPathValidator({
        allowedDirectories: ['/tmp'],
        strictMode: true,
      });

      // Test normalization with a valid path (no traversal)
      const normalized = validator.normalize('/tmp/subdir/file.aasx');
      expect(normalized).toBe('/tmp/subdir/file.aasx');
    });

    it('should reject paths with traversal in normalize', () => {
      const validator = createPathValidator({
        allowedDirectories: ['/tmp'],
        strictMode: true,
      });

      // Traversal attempts should be rejected
      expect(() => validator.normalize('/tmp/../etc/passwd')).toThrow();
    });

    it('should throw on invalid paths when using normalize', () => {
      const validator = createPathValidator({
        allowedDirectories: ['/tmp'],
        strictMode: true,
      });

      expect(() => validator.normalize('/etc/passwd')).toThrow();
    });
  });

  describe('loadAllowedDirectoriesFromEnv', () => {
    const originalEnv = process.env.MCP_ALLOWED_DIRECTORIES;
    const originalWorkspace = process.env.MCP_WORKSPACE_DIR;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.MCP_ALLOWED_DIRECTORIES;
      } else {
        process.env.MCP_ALLOWED_DIRECTORIES = originalEnv;
      }
      if (originalWorkspace === undefined) {
        delete process.env.MCP_WORKSPACE_DIR;
      } else {
        process.env.MCP_WORKSPACE_DIR = originalWorkspace;
      }
    });

    it('should return workspace directory when env var not set', () => {
      delete process.env.MCP_ALLOWED_DIRECTORIES;
      process.env.MCP_WORKSPACE_DIR = '/test/workspace';

      const dirs = loadAllowedDirectoriesFromEnv();
      expect(dirs).toEqual(['/test/workspace']);
    });

    it('should parse colon-separated directories', () => {
      process.env.MCP_ALLOWED_DIRECTORIES = '/tmp:/home/user/data';

      const dirs = loadAllowedDirectoriesFromEnv();
      expect(dirs).toContain('/tmp');
      expect(dirs).toContain('/home/user/data');
    });
  });
});
