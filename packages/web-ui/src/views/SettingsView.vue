<script setup lang="ts">
import { ref } from 'vue';

const mcpServerUrl = ref(import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:3001');
const theme = ref<'light' | 'dark' | 'system'>('system');
const autoValidate = ref(true);
const showApprovalTiers = ref(true);
</script>

<template>
  <div class="settings-view">
    <h1>Settings</h1>

    <section class="settings-section">
      <h2>Connection</h2>

      <div class="setting-row">
        <label for="mcp-url">MCP Server URL</label>
        <input
          id="mcp-url"
          v-model="mcpServerUrl"
          type="text"
          class="input"
          placeholder="http://localhost:3001"
        />
      </div>
    </section>

    <section class="settings-section">
      <h2>Appearance</h2>

      <div class="setting-row">
        <label>Theme</label>
        <div class="radio-group">
          <label>
            <input v-model="theme" type="radio" value="light" />
            Light
          </label>
          <label>
            <input v-model="theme" type="radio" value="dark" />
            Dark
          </label>
          <label>
            <input v-model="theme" type="radio" value="system" />
            System
          </label>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h2>Editor</h2>

      <div class="setting-row">
        <label for="auto-validate">
          <input
            id="auto-validate"
            v-model="autoValidate"
            type="checkbox"
          />
          Auto-validate on changes
        </label>
      </div>

      <div class="setting-row">
        <label for="show-tiers">
          <input
            id="show-tiers"
            v-model="showApprovalTiers"
            type="checkbox"
          />
          Show approval tier indicators
        </label>
      </div>
    </section>

    <div class="settings-actions">
      <button class="btn btn-primary">Save Settings</button>
      <button class="btn btn-secondary">Reset to Defaults</button>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  max-width: 600px;
  margin: 0 auto;
}

.settings-section {
  margin: 2rem 0;
  padding: 1.5rem;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.settings-section h2 {
  margin: 0 0 1rem;
  font-size: 1rem;
  color: var(--color-text-secondary);
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.setting-row:last-child {
  margin-bottom: 0;
}

.input {
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  font-size: 1rem;
}

.radio-group {
  display: flex;
  gap: 1rem;
}

.radio-group label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.settings-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}
</style>
