<script setup lang="ts">
import { ref, computed } from 'vue';
import { useMcpService } from '@/services/mcp';
import { useNotificationStore } from '@/stores/notification';

const mcpService = useMcpService();
const notificationStore = useNotificationStore();

const importType = ref<'pdf' | 'spreadsheet' | 'image' | 'aas'>('pdf');
const file = ref<File | null>(null);
const isImporting = ref(false);
const importResult = ref<{ success: boolean; message: string; data?: unknown } | null>(null);

const acceptTypes = computed(() => {
  const types: Record<string, string> = {
    pdf: '.pdf',
    spreadsheet: '.csv,.xlsx,.xls',
    image: '.png,.jpg,.jpeg,.webp',
    aas: '.aasx,.json',
  };
  return types[importType.value];
});

const toolName = computed(() => {
  const tools: Record<string, string> = {
    pdf: 'import_pdf',
    spreadsheet: 'import_spreadsheet',
    image: 'import_image',
    aas: 'import_aas',
  };
  return tools[importType.value];
});

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files?.length) {
    file.value = target.files[0];
    importResult.value = null;
  }
}

function clearFile() {
  file.value = null;
  importResult.value = null;
}

async function handleImport() {
  if (!file.value) return;

  isImporting.value = true;
  importResult.value = null;

  try {
    // Read file as base64
    const base64Content = await readFileAsBase64(file.value);

    // Build params based on import type
    // All import tools accept base64Content for browser uploads
    const params: Record<string, unknown> = {
      base64Content,
    };

    // Add type-specific params
    if (importType.value === 'spreadsheet') {
      // Spreadsheet tool needs fileType hint for base64 content
      const ext = file.value.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
        params.fileType = ext;
      }
    } else if (importType.value === 'image') {
      // Image tool needs mimeType hint
      const ext = file.value.name.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      };
      params.mimeType = mimeTypes[ext || ''] || 'image/png';
    }

    const result = await mcpService.callTool(toolName.value, params);

    if (result.success) {
      importResult.value = {
        success: true,
        message: (result.data as { message?: string })?.message || 'Import completed',
        data: result.data,
      };
      notificationStore.success(`Import completed: ${file.value.name}`);
    } else {
      importResult.value = {
        success: false,
        message: result.error || 'Import failed',
      };
      notificationStore.error(result.error || 'Import failed');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    importResult.value = {
      success: false,
      message,
    };
    notificationStore.error(`Import failed: ${message}`);
  } finally {
    isImporting.value = false;
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div class="import-view">
    <h1>Import Data</h1>
    <p>Import data from external sources into your AAS document</p>

    <div class="import-options">
      <div class="option-card" :class="{ selected: importType === 'pdf' }" @click="importType = 'pdf'">
        <span class="option-icon">📄</span>
        <span class="option-label">PDF Datasheet</span>
        <span class="option-description">Extract data from product datasheets using AI</span>
      </div>

      <div class="option-card" :class="{ selected: importType === 'spreadsheet' }" @click="importType = 'spreadsheet'">
        <span class="option-icon">📊</span>
        <span class="option-label">CSV / Excel</span>
        <span class="option-description">Import tabular data with column mapping</span>
      </div>

      <div class="option-card" :class="{ selected: importType === 'image' }" @click="importType = 'image'">
        <span class="option-icon">📷</span>
        <span class="option-label">Image OCR</span>
        <span class="option-description">Extract text from nameplate photos</span>
      </div>

      <div class="option-card" :class="{ selected: importType === 'aas' }" @click="importType = 'aas'">
        <span class="option-icon">📦</span>
        <span class="option-label">AASX Merge</span>
        <span class="option-description">Merge submodels from another AASX file</span>
      </div>
    </div>

    <div class="file-upload">
      <label class="upload-area">
        <input
          type="file"
          :accept="acceptTypes"
          @change="handleFileSelect"
          hidden
        />
        <template v-if="!file">
          <span class="upload-icon">📁</span>
          <span>Drop file here or click to browse</span>
          <span class="upload-hint">Accepts: {{ acceptTypes }}</span>
        </template>
        <template v-else>
          <span class="file-info">
            <span class="file-name">{{ file.name }}</span>
            <span class="file-size">({{ formatFileSize(file.size) }})</span>
            <button class="clear-btn" @click.prevent="clearFile">✕</button>
          </span>
        </template>
      </label>
    </div>

    <button
      class="btn btn-primary"
      :disabled="!file || isImporting"
      @click="handleImport"
    >
      {{ isImporting ? 'Importing...' : 'Import' }}
    </button>

    <!-- Import Result -->
    <div v-if="importResult" :class="['import-result', importResult.success ? 'success' : 'error']">
      <div class="result-header">
        <span class="result-icon">{{ importResult.success ? '✓' : '✗' }}</span>
        <span class="result-message">{{ importResult.message }}</span>
      </div>
      <div v-if="importResult.data" class="result-data">
        <pre>{{ JSON.stringify(importResult.data, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-view {
  max-width: 800px;
  margin: 0 auto;
}

.import-view h1 {
  margin-bottom: 0.5rem;
}

.import-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin: 2rem 0;
}

.option-card {
  padding: 1.5rem;
  background-color: var(--color-bg-primary);
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option-card:hover {
  border-color: var(--color-primary);
}

.option-card.selected {
  border-color: var(--color-primary);
  background-color: rgba(59, 130, 246, 0.05);
}

.option-icon {
  font-size: 2rem;
}

.option-label {
  font-weight: 600;
}

.option-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.file-upload {
  margin-bottom: 1.5rem;
}

.upload-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  border: 2px dashed var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
  color: var(--color-text-muted);
}

.upload-area:hover {
  border-color: var(--color-primary);
  color: var(--color-text-primary);
}

.upload-area {
  flex-direction: column;
  gap: 0.5rem;
}

.upload-icon {
  font-size: 2rem;
}

.upload-hint {
  font-size: 0.75rem;
  opacity: 0.7;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.file-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.file-size {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.clear-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.25rem;
  font-size: 0.875rem;
}

.clear-btn:hover {
  color: var(--color-danger);
}

.import-result {
  margin-top: 1.5rem;
  padding: 1rem;
  border-radius: 0.5rem;
}

.import-result.success {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid var(--color-success, #22c55e);
}

.import-result.error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--color-danger, #ef4444);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.result-icon {
  font-size: 1.25rem;
}

.import-result.success .result-icon {
  color: var(--color-success, #22c55e);
}

.import-result.error .result-icon {
  color: var(--color-danger, #ef4444);
}

.result-data {
  margin-top: 1rem;
  padding: 0.75rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.25rem;
  overflow: auto;
}

.result-data pre {
  margin: 0;
  font-size: 0.75rem;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
