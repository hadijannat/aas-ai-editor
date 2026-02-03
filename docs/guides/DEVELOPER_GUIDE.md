# Developer Guide

This guide covers development workflows, conventions, and best practices for contributing to the AAS AI Editor.

## Development Environment

### Recommended IDE Setup

**VS Code** with extensions:
- ESLint
- Prettier
- Vue Language Features (Volar)
- TypeScript Vue Plugin (Volar)
- Python
- Docker

**Settings** (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[vue]": {
    "editor.defaultFormatter": "Vue.volar"
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Useful Commands

```bash
# Development
pnpm dev              # Start all services
pnpm dev:web          # Start web UI with HMR
pnpm dev:mcp          # Start MCP server with nodemon

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix auto-fixable issues
pnpm format           # Format with Prettier
pnpm typecheck        # TypeScript type checking

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:e2e         # Playwright E2E tests

# Building
pnpm build            # Build all packages
pnpm clean            # Clean build artifacts

# Package-specific
pnpm --filter @aas-ai-editor/core test
pnpm --filter @aas-ai-editor/web-ui dev
```

## Package Development

### Core Library (`packages/core`)

The core library is pure TypeScript with no runtime dependencies on Node.js or browser APIs.

**Key modules**:
- `src/aasx/` - AASX file handling (ZIP, OPC relationships)
- `src/aas/` - AAS types and selectors
- `src/patch/` - JSON Patch operations
- `src/diff/` - AAS-aware diff calculation
- `src/idta/` - IDTA template handling

**Example: Adding a new selector**:
```typescript
// src/aas/selectors.ts
export function selectSubmodelBySemanticId(
  env: Environment,
  semanticId: string
): Submodel | undefined {
  return env.submodels?.find(sm =>
    sm.semanticId?.keys?.some(k => k.value === semanticId)
  );
}
```

**Testing**:
```bash
cd packages/core
pnpm test
pnpm test:watch src/aas/selectors.test.ts
```

### MCP Server (`packages/mcp-server`)

Express-based MCP server with Claude AI integration.

**Key modules**:
- `src/transport/` - Streamable HTTP handling
- `src/tools/` - MCP tool implementations
- `src/ai/` - Claude client and caching
- `src/resources/` - MCP resource providers

**Adding a new tool**:
```typescript
// src/tools/myNewTool.ts
import { McpTool } from '../types';

export const myNewTool: McpTool = {
  name: 'aas_my_new_tool',
  description: 'Description for the AI',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string' },
    },
    required: ['param1'],
  },
  handler: async (input, context) => {
    // Implementation
    return { success: true, data: result };
  },
};

// Register in src/tools/index.ts
```

### Web UI (`packages/web-ui`)

Vue 3 + TypeScript + Vite application.

**Key directories**:
- `src/components/` - Vue components
- `src/composables/` - Reusable composition functions
- `src/stores/` - Pinia state stores
- `src/services/` - API and MCP client

**Component conventions**:
```vue
<!-- components/MyComponent.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDocumentStore } from '@/stores/document';

// Props
const props = defineProps<{
  elementPath: string;
}>();

// Emits
const emit = defineEmits<{
  (e: 'select', path: string): void;
}>();

// Store
const documentStore = useDocumentStore();

// Local state
const isExpanded = ref(false);
</script>

<template>
  <div class="my-component">
    <!-- template -->
  </div>
</template>

<style scoped>
.my-component {
  /* styles */
}
</style>
```

### Validation Service (`packages/validation-service`)

Python FastAPI application.

**Setup**:
```bash
cd packages/validation-service
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

**Running**:
```bash
uvicorn src.main:app --reload --port 8000
```

**Adding a validator**:
```python
# src/validators/my_validator.py
from typing import List
from ..models import ValidationError

def validate_something(data: dict) -> List[ValidationError]:
    errors = []
    # validation logic
    return errors
```

## Testing Strategy

### Unit Tests

- **Location**: Colocated with source (e.g., `foo.ts` → `foo.test.ts`)
- **Framework**: Vitest (TS packages), pytest (Python)
- **Focus**: Pure functions, transformations, business logic

```typescript
// src/patch/apply.test.ts
import { describe, it, expect } from 'vitest';
import { applyPatch } from './apply';

describe('applyPatch', () => {
  it('should replace value at path', () => {
    const env = { submodels: [{ idShort: 'test' }] };
    const patch = { op: 'replace', path: '/submodels/0/idShort', value: 'new' };

    const result = applyPatch(env, [patch]);

    expect(result.submodels[0].idShort).toBe('new');
  });
});
```

### Integration Tests

- **Location**: `tests/integration/`
- **Focus**: MCP tool handlers, API endpoints
- **Mocking**: Claude API responses mocked

### E2E Tests

- **Location**: `packages/web-ui/e2e/`
- **Framework**: Playwright
- **Focus**: User workflows, browser interactions

```typescript
// e2e/edit-flow.spec.ts
import { test, expect } from '@playwright/test';

test('user can edit a property with AI', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid="upload-button"]').click();
  // ... test workflow
});
```

## Code Conventions

### TypeScript

- Use explicit return types for public functions
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for literal types
- Avoid `any` - use `unknown` with type guards

### Vue

- Use `<script setup>` syntax
- Props/emits with TypeScript generics
- Composables for reusable logic
- Scoped styles by default

### Git Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add semantic ID matching to diff
fix(web-ui): prevent tree collapse on edit
docs: update MCP tools reference
chore: upgrade TypeScript to 5.7
```

### Branch Naming

```
feat/add-template-import
fix/validation-timeout
docs/update-architecture
chore/upgrade-deps
```

## Debugging

### MCP Server

Enable debug logging:
```bash
DEBUG=aas:* pnpm dev:mcp
```

### Vue DevTools

Install Vue DevTools browser extension for component inspection and Pinia store debugging.

### Network Inspection

MCP requests visible in browser DevTools Network tab under `POST /mcp`.

## Performance Considerations

- **Large AASX files**: Stream parsing, lazy load submodels
- **AI Context**: Limit context size, use caching
- **Validation**: Fast validation first, deep validation on-demand
- **UI**: Virtual scrolling for large trees

## Security Checklist

When implementing features:

- [ ] Validate all user inputs
- [ ] Sanitize content from AASX files
- [ ] Never log API keys or sensitive data
- [ ] Use parameterized queries (if DB is added)
- [ ] Review for XSS in dynamic content
- [ ] Test with malformed inputs
