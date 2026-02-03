/**
 * Document Store
 *
 * Manages the currently loaded AAS document state.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useMcpService } from '@/services/mcp';
import { useNotificationStore } from './notification';

import type { AasPatchOp } from '@/utils/diff';

export interface PendingOperation {
  id: string;
  toolName: string;
  tier: number;
  reason: string;
  createdAt: string;
  patches: AasPatchOp[];
}

export const useDocumentStore = defineStore('document', () => {
  const mcpService = useMcpService();

  // State
  const documentId = ref<string | null>(null);
  const filename = ref<string | null>(null);
  const environment = ref<Record<string, unknown> | null>(null);
  const isDirty = ref(false);
  const pendingOperations = ref<PendingOperation[]>([]);
  const canUndo = ref(false);
  const canRedo = ref(false);

  // Computed
  const isLoaded = computed(() => environment.value !== null);

  // Actions
  async function openFile() {
    const notificationStore = useNotificationStore();

    // Create a hidden file input to trigger the file picker
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.aasx,.json';
    fileInput.style.display = 'none';

    fileInput.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) {
        return;
      }

      try {
        notificationStore.info(`Loading ${file.name}...`);

        // Read file as base64
        const content = await readFileAsBase64(file);

        // Call MCP tool with content
        const result = await mcpService.callTool('document_load_content', {
          content,
          filename: file.name,
        });

        if (result.success && result.data) {
          const data = result.data as {
            documentId: string;
            filename: string;
            summary?: {
              assetAdministrationShells: number;
              submodels: number;
              conceptDescriptions: number;
            };
          };
          documentId.value = data.documentId;
          filename.value = data.filename;

          // Fetch the environment from MCP resource
          await loadEnvironment();

          notificationStore.success(
            `Loaded ${data.filename}: ${data.summary?.assetAdministrationShells || 0} AAS, ${data.summary?.submodels || 0} Submodels`
          );
        } else {
          notificationStore.error(result.error || 'Failed to load document');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        notificationStore.error(`Failed to load document: ${message}`);
      } finally {
        // Clean up
        document.body.removeChild(fileInput);
      }
    };

    // Add to DOM and trigger click
    document.body.appendChild(fileInput);
    fileInput.click();
  }

  /**
   * Read a File as base64 string
   */
  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:application/octet-stream;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Load the environment from MCP resource
   */
  async function loadEnvironment() {
    try {
      const env = await mcpService.readResource(`aas://document/environment`);
      environment.value = env as Record<string, unknown>;
    } catch (error) {
      console.error('Failed to load environment resource:', error);
    }
  }

  async function saveFile(path?: string) {
    const notificationStore = useNotificationStore();

    try {
      // If content-loaded document (browser upload), trigger browser download
      if (documentId.value?.startsWith('content://') && !path) {
        const result = await mcpService.callTool('document_export', {});
        if (result.success && result.data) {
          const exportData = result.data as {
            content: string;
            mimeType: string;
            filename: string;
          };
          downloadBase64(exportData.content, exportData.filename, exportData.mimeType);
          isDirty.value = false;
          notificationStore.success('Document downloaded');
          return;
        }
        notificationStore.error(result.error || 'Failed to export document');
        return;
      }

      // Server-side save for file-based documents
      const result = await mcpService.callTool('document_save', { path });

      if (result.success) {
        isDirty.value = false;
        notificationStore.success('Document saved');
      }
    } catch (_error) {
      notificationStore.error('Failed to save document');
    }
  }

  /**
   * Download base64-encoded content as a file in the browser
   */
  function downloadBase64(base64Content: string, filename: string, mimeType: string) {
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function undo() {
    const result = await mcpService.callTool('document_undo', {});
    if (result.success) {
      await refreshState();
    }
  }

  async function redo() {
    const result = await mcpService.callTool('document_redo', {});
    if (result.success) {
      await refreshState();
    }
  }

  async function refreshState() {
    const status = await mcpService.callTool('document_status', {});
    if (status.success && status.data) {
      const statusData = status.data as { canUndo: boolean; canRedo: boolean; dirty: boolean };
      canUndo.value = statusData.canUndo;
      canRedo.value = statusData.canRedo;
      isDirty.value = statusData.dirty;
    }

    const pending = await mcpService.callTool('edit_list_pending', {});
    if (pending.success && pending.data) {
      const pendingData = pending.data as { pending: PendingOperation[] };
      pendingOperations.value = pendingData.pending;
    }

    // Reload environment to reflect changes from undo/redo/approval
    await loadEnvironment();
  }

  async function approveOperations(ids: string[]) {
    const result = await mcpService.callTool('edit_approve', {
      operationIds: ids,
    });

    if (result.success) {
      await refreshState();
    }
  }

  async function rejectOperations(ids: string[], reason?: string) {
    const result = await mcpService.callTool('edit_reject', {
      operationIds: ids,
      reason,
    });

    if (result.success) {
      await refreshState();
    }
  }

  return {
    // State
    documentId,
    filename,
    environment,
    isDirty,
    pendingOperations,
    canUndo,
    canRedo,

    // Computed
    isLoaded,

    // Actions
    openFile,
    saveFile,
    undo,
    redo,
    refreshState,
    approveOperations,
    rejectOperations,
  };
});
