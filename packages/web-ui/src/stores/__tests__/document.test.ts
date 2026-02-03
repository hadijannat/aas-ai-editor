/**
 * Document Store Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDocumentStore } from '../document';

// Mock the MCP service
const mockCallTool = vi.fn();
const mockReadResource = vi.fn();

vi.mock('@/services/mcp', () => ({
  useMcpService: () => ({
    callTool: mockCallTool,
    readResource: mockReadResource,
  }),
}));

// Mock the notification store
vi.mock('../notification', () => ({
  useNotificationStore: vi.fn(() => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('useDocumentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('initializes with null document state', () => {
    const store = useDocumentStore();

    expect(store.documentId).toBeNull();
    expect(store.filename).toBeNull();
    expect(store.environment).toBeNull();
    expect(store.isDirty).toBe(false);
    expect(store.isLoaded).toBe(false);
  });

  it('computes isLoaded based on environment', () => {
    const store = useDocumentStore();

    expect(store.isLoaded).toBe(false);

    store.environment = { assetAdministrationShells: [], submodels: [] };
    expect(store.isLoaded).toBe(true);
  });

  it('calls document_undo tool when undo is triggered', async () => {
    mockCallTool.mockResolvedValueOnce({ success: true });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { canUndo: false, canRedo: true, dirty: false } });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { pending: [] } });
    mockReadResource.mockResolvedValueOnce({});

    const store = useDocumentStore();
    await store.undo();

    expect(mockCallTool).toHaveBeenCalledWith('document_undo', {});
  });

  it('calls document_redo tool when redo is triggered', async () => {
    mockCallTool.mockResolvedValueOnce({ success: true });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { canUndo: true, canRedo: false, dirty: false } });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { pending: [] } });
    mockReadResource.mockResolvedValueOnce({});

    const store = useDocumentStore();
    await store.redo();

    expect(mockCallTool).toHaveBeenCalledWith('document_redo', {});
  });

  it('updates pending operations on refreshState', async () => {
    const mockPendingOps = [
      {
        id: 'op-1',
        toolName: 'edit_add',
        tier: 2,
        reason: 'Test operation',
        createdAt: new Date().toISOString(),
        patches: [],
      },
    ];

    mockCallTool.mockResolvedValueOnce({
      success: true,
      data: { canUndo: true, canRedo: false, dirty: true },
    });
    mockCallTool.mockResolvedValueOnce({
      success: true,
      data: { pending: mockPendingOps },
    });
    mockReadResource.mockResolvedValueOnce({});

    const store = useDocumentStore();
    await store.refreshState();

    expect(store.canUndo).toBe(true);
    expect(store.canRedo).toBe(false);
    expect(store.isDirty).toBe(true);
    expect(store.pendingOperations).toEqual(mockPendingOps);
  });

  it('calls edit_approve tool when approving operations', async () => {
    mockCallTool.mockResolvedValueOnce({ success: true });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { canUndo: true, canRedo: false, dirty: true } });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { pending: [] } });
    mockReadResource.mockResolvedValueOnce({});

    const store = useDocumentStore();
    await store.approveOperations(['op-1', 'op-2']);

    expect(mockCallTool).toHaveBeenCalledWith('edit_approve', { operationIds: ['op-1', 'op-2'] });
  });

  it('calls edit_reject tool when rejecting operations', async () => {
    mockCallTool.mockResolvedValueOnce({ success: true });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { canUndo: true, canRedo: false, dirty: true } });
    mockCallTool.mockResolvedValueOnce({ success: true, data: { pending: [] } });
    mockReadResource.mockResolvedValueOnce({});

    const store = useDocumentStore();
    await store.rejectOperations(['op-1'], 'Not needed');

    expect(mockCallTool).toHaveBeenCalledWith('edit_reject', {
      operationIds: ['op-1'],
      reason: 'Not needed',
    });
  });
});
