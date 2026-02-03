<script setup lang="ts">
import { ref, onMounted } from 'vue';

const mcpServerUrl = ref(import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:3001');
const theme = ref<'light' | 'dark' | 'system'>('system');
const autoValidate = ref(true);
const showApprovalTiers = ref(true);

// AI Configuration
const anthropicApiKey = ref('');
const showApiKey = ref(false);
const apiKeyStatus = ref<'unchecked' | 'valid' | 'invalid'>('unchecked');

// Settings saved status
const settingsSaved = ref(false);

// Default values for reset
const DEFAULTS = {
  mcpServerUrl: 'http://localhost:3001',
  theme: 'system' as const,
  autoValidate: true,
  showApprovalTiers: true,
};

// Load saved settings from localStorage
onMounted(() => {
  const savedApiKey = localStorage.getItem('anthropic_api_key');
  if (savedApiKey) {
    anthropicApiKey.value = savedApiKey;
    apiKeyStatus.value = 'valid'; // Assume valid if previously saved
  }

  // Load other saved settings
  const savedMcpUrl = localStorage.getItem('mcp_server_url');
  if (savedMcpUrl) {
    mcpServerUrl.value = savedMcpUrl;
  }

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
    theme.value = savedTheme;
  }

  const savedAutoValidate = localStorage.getItem('auto_validate');
  if (savedAutoValidate !== null) {
    autoValidate.value = savedAutoValidate === 'true';
  }

  const savedShowTiers = localStorage.getItem('show_approval_tiers');
  if (savedShowTiers !== null) {
    showApprovalTiers.value = savedShowTiers === 'true';
  }
});

const saveApiKey = () => {
  if (anthropicApiKey.value.trim()) {
    localStorage.setItem('anthropic_api_key', anthropicApiKey.value.trim());
    apiKeyStatus.value = 'valid';
  } else {
    localStorage.removeItem('anthropic_api_key');
    apiKeyStatus.value = 'unchecked';
  }
};

const clearApiKey = () => {
  anthropicApiKey.value = '';
  localStorage.removeItem('anthropic_api_key');
  apiKeyStatus.value = 'unchecked';
};

const saveSettings = () => {
  // Save all settings to localStorage
  localStorage.setItem('mcp_server_url', mcpServerUrl.value);
  localStorage.setItem('theme', theme.value);
  localStorage.setItem('auto_validate', String(autoValidate.value));
  localStorage.setItem('show_approval_tiers', String(showApprovalTiers.value));

  // Apply theme immediately
  applyTheme(theme.value);

  // Show saved confirmation
  settingsSaved.value = true;
  setTimeout(() => {
    settingsSaved.value = false;
  }, 2000);
};

const resetToDefaults = () => {
  // Reset values to defaults
  mcpServerUrl.value = DEFAULTS.mcpServerUrl;
  theme.value = DEFAULTS.theme;
  autoValidate.value = DEFAULTS.autoValidate;
  showApprovalTiers.value = DEFAULTS.showApprovalTiers;

  // Clear from localStorage (keep API key separate)
  localStorage.removeItem('mcp_server_url');
  localStorage.removeItem('theme');
  localStorage.removeItem('auto_validate');
  localStorage.removeItem('show_approval_tiers');

  // Apply default theme
  applyTheme(DEFAULTS.theme);
};

const applyTheme = (selectedTheme: 'light' | 'dark' | 'system') => {
  const root = document.documentElement;
  if (selectedTheme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', selectedTheme);
  }
};
</script>

<template>
  <div class="settings-view">
    <h1>Settings</h1>

    <section class="settings-section">
      <h2>AI Configuration</h2>

      <div class="setting-row">
        <label for="api-key">Anthropic API Key</label>
        <div class="api-key-input">
          <input
            id="api-key"
            v-model="anthropicApiKey"
            :type="showApiKey ? 'text' : 'password'"
            class="input"
            placeholder="sk-ant-..."
          />
          <button
            type="button"
            class="btn btn-icon"
            @click="showApiKey = !showApiKey"
            :title="showApiKey ? 'Hide API key' : 'Show API key'"
          >
            {{ showApiKey ? '🙈' : '👁️' }}
          </button>
        </div>
        <div class="api-key-actions">
          <button class="btn btn-primary btn-sm" @click="saveApiKey">
            Save Key
          </button>
          <button class="btn btn-secondary btn-sm" @click="clearApiKey">
            Clear
          </button>
          <span v-if="apiKeyStatus === 'valid'" class="status-badge status-valid">✓ Saved</span>
        </div>
        <p class="setting-hint">
          Get your API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>
        </p>
      </div>
    </section>

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
      <button class="btn btn-primary" @click="saveSettings">
        {{ settingsSaved ? 'Saved!' : 'Save Settings' }}
      </button>
      <button class="btn btn-secondary" @click="resetToDefaults">Reset to Defaults</button>
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
  flex: 1;
}

.api-key-input {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.api-key-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.5rem;
}

.btn-icon {
  padding: 0.5rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 1rem;
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-valid {
  background-color: #d4edda;
  color: #155724;
}

.setting-hint {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.5rem;
}

.setting-hint a {
  color: var(--color-primary);
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
