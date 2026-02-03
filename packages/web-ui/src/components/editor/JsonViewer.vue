<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  data: unknown;
}>();

const formattedJson = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2);
  } catch {
    return 'Unable to display data';
  }
});

function copyToClipboard() {
  navigator.clipboard.writeText(formattedJson.value);
}
</script>

<template>
  <div class="json-viewer panel">
    <div class="viewer-header">
      <span>JSON View</span>
      <button class="btn btn-secondary" @click="copyToClipboard">
        Copy
      </button>
    </div>
    <pre class="json-content"><code>{{ formattedJson }}</code></pre>
  </div>
</template>

<style scoped>
.json-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border);
  font-weight: 500;
}

.json-content {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 1rem;
  background-color: var(--color-bg-tertiary);
  border-radius: 0.375rem;
  font-family: 'Fira Code', 'Monaco', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>
