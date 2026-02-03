/**
 * Authentication Middleware Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { createAuthMiddleware, hashApiKey, loadApiKeysFromEnv } from '../../src/security/auth.js';
import type { Request, Response, NextFunction } from 'express';

describe('Authentication Middleware', () => {
  const mockNext = vi.fn<[], void>() as NextFunction;
  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashApiKey', () => {
    it('should produce consistent hashes', () => {
      const key = 'test-api-key-123';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('key1');
      const hash2 = hashApiKey('key2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createAuthMiddleware', () => {
    it('should allow requests when auth is disabled', () => {
      const middleware = createAuthMiddleware({ enabled: false });
      const req = { path: '/mcp', headers: {} } as Request;

      middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow public endpoints without authentication', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['test-key'],
        publicEndpoints: ['/health'],
      });
      const req = { path: '/health', headers: {} } as Request;

      middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow requests when no API keys are configured', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: [],
      });
      const req = { path: '/mcp', headers: {} } as Request;

      middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject requests without API key', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['test-key'],
      });
      const req = { path: '/mcp', headers: {} } as Request;

      middleware(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept valid X-API-Key header', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['test-key'],
      });
      const req = {
        path: '/mcp',
        headers: { 'x-api-key': 'test-key' },
      } as unknown as Request;

      middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should accept valid Bearer token', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['test-key'],
      });
      const req = {
        path: '/mcp',
        headers: { authorization: 'Bearer test-key' },
      } as unknown as Request;

      middleware(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid API key', () => {
      const middleware = createAuthMiddleware({
        enabled: true,
        apiKeys: ['valid-key'],
      });
      const req = {
        path: '/mcp',
        headers: { 'x-api-key': 'invalid-key' },
      } as unknown as Request;

      middleware(req, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('loadApiKeysFromEnv', () => {
    const originalEnv = process.env.MCP_API_KEYS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.MCP_API_KEYS;
      } else {
        process.env.MCP_API_KEYS = originalEnv;
      }
    });

    it('should return empty array when env var not set', () => {
      delete process.env.MCP_API_KEYS;
      expect(loadApiKeysFromEnv()).toEqual([]);
    });

    it('should parse comma-separated keys', () => {
      process.env.MCP_API_KEYS = 'key1,key2,key3';
      expect(loadApiKeysFromEnv()).toEqual(['key1', 'key2', 'key3']);
    });

    it('should trim whitespace from keys', () => {
      process.env.MCP_API_KEYS = ' key1 , key2 ';
      expect(loadApiKeysFromEnv()).toEqual(['key1', 'key2']);
    });

    it('should filter empty keys', () => {
      process.env.MCP_API_KEYS = 'key1,,key2,';
      expect(loadApiKeysFromEnv()).toEqual(['key1', 'key2']);
    });
  });
});
