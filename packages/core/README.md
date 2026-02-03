# @aas-ai-editor/core

[![npm version](https://img.shields.io/npm/v/@aas-ai-editor/core.svg)](https://www.npmjs.com/package/@aas-ai-editor/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Core library for working with Asset Administration Shell (AAS) packages. Provides AASX file parsing, patch-based editing, semantic diffing, and IDTA template validation.

## Installation

```bash
npm install @aas-ai-editor/core
```

## Quick Start

```typescript
import { readAasx, writeAasx } from '@aas-ai-editor/core/aasx';
import { selectSubmodelBySemanticId } from '@aas-ai-editor/core/aas';
import { applyPatch, createPatch } from '@aas-ai-editor/core/patch';

// Read an AASX file
const buffer = await fs.readFile('example.aasx');
const { environment, files, metadata } = await readAasx(buffer);

// Navigate the AAS structure
const nameplate = selectSubmodelBySemanticId(
  environment,
  'https://admin-shell.io/zvei/nameplate/2/0/Nameplate'
);

// Modify with patches (enables undo/redo)
const patch = createPatch(
  'replace',
  '/submodels/0/submodelElements/0/value',
  'New Value'
);
const result = applyPatch(environment, [patch]);

// Write back to AASX
const output = await writeAasx(result.environment, { files, metadata });
await fs.writeFile('modified.aasx', output);
```

## API Reference

### Main Export (`@aas-ai-editor/core`)

Re-exports all modules for convenience:

```typescript
import {
  readAasx, writeAasx,           // AASX handling
  selectSubmodelBySemanticId,    // Selectors
  applyPatch, createPatch,       // Patch operations
  calculateDiff,                  // Diffing
  loadTemplate,                   // Templates
} from '@aas-ai-editor/core';
```

---

### AASX Module (`@aas-ai-editor/core/aasx`)

Read and write AASX packages (OPC-based ZIP files).

```typescript
import { readAasx, writeAasx } from '@aas-ai-editor/core/aasx';
```

#### `readAasx(buffer, options?)`

Parses an AASX file from a Buffer or Uint8Array.

```typescript
const { environment, files, metadata } = await readAasx(aasxBuffer);

// environment: The AAS Environment with shells, submodels, concept descriptions
// files: Map of supplementary files (thumbnails, documents, etc.)
// metadata: OPC package metadata
```

**Options:**
- `strict?: boolean` - Throw on invalid structures (default: false)

#### `writeAasx(environment, options?)`

Creates an AASX file as a Uint8Array.

```typescript
const buffer = await writeAasx(environment, {
  files,      // Optional: supplementary files to include
  metadata,   // Optional: OPC metadata
});
```

---

### AAS Module (`@aas-ai-editor/core/aas`)

Type definitions and selectors for navigating AAS structures.

```typescript
import {
  type Environment,
  type Submodel,
  type Property,
  selectSubmodelBySemanticId,
  selectSmeByIdShort,
  selectAasById,
} from '@aas-ai-editor/core/aas';
```

#### Selectors

```typescript
// Find submodel by semantic ID
const submodel = selectSubmodelBySemanticId(env, 'https://...');

// Find element by idShort within a submodel
const property = selectSmeByIdShort(submodel, 'ManufacturerName');

// Find AAS by ID
const aas = selectAasById(env, 'urn:example:aas:1');

// Get JSON Pointer path to an element
const path = getElementPath(env, element); // "/submodels/0/submodelElements/2"
```

#### Types

Full TypeScript definitions for the AAS metamodel:

- `Environment` - Root container
- `AssetAdministrationShell` - AAS with asset reference
- `Submodel` - Submodel with elements
- `SubmodelElement` - Base for all elements
- `Property`, `Range`, `File`, `Blob` - Data elements
- `SubmodelElementCollection`, `SubmodelElementList` - Containers
- `Reference`, `Key`, `SemanticId` - Reference types

---

### Patch Module (`@aas-ai-editor/core/patch`)

JSON Patch (RFC 6902) operations with AAS extensions.

```typescript
import {
  createPatch,
  applyPatch,
  applyPatches,
  invertPatch,
  classifyPatchTier,
  ApprovalTier,
} from '@aas-ai-editor/core/patch';
```

#### `createPatch(op, path, value?, from?)`

Creates a single patch operation.

```typescript
const addPatch = createPatch('add', '/submodels/-', newSubmodel);
const replacePatch = createPatch('replace', '/submodels/0/idShort', 'NewName');
const removePatch = createPatch('remove', '/submodels/1');
const movePatch = createPatch('move', '/submodels/1', undefined, '/submodels/0');
```

#### `applyPatch(environment, patches)`

Applies patches and returns the modified environment.

```typescript
const result = applyPatch(environment, [patch1, patch2]);
// result.environment - Modified environment
// result.applied - Successfully applied patches
// result.failed - Patches that couldn't be applied
```

#### `invertPatch(patch)`

Creates an undo patch for a given operation.

```typescript
const undoPatch = invertPatch(originalPatch);
applyPatch(environment, [undoPatch]); // Reverts the change
```

#### `classifyPatchTier(patch)`

Classifies patches by risk level for approval workflows.

```typescript
const tier = classifyPatchTier(patch);
// ApprovalTier.LOW - Metadata only
// ApprovalTier.MEDIUM - Structural changes
// ApprovalTier.HIGH - Cross-references, deletions
// ApprovalTier.CRITICAL - External identifiers
```

---

### Diff Module (`@aas-ai-editor/core/diff`)

Semantic diffing that matches elements by semanticId/idShort rather than array index.

```typescript
import { calculateDiff, formatDiff } from '@aas-ai-editor/core/diff';
```

#### `calculateDiff(before, after)`

Calculates differences between two environments.

```typescript
const diff = calculateDiff(oldEnv, newEnv);

for (const entry of diff.entries) {
  console.log(`${entry.type}: ${entry.path}`);
  // 'added', 'removed', 'modified', 'moved'
}
```

#### `formatDiff(diff)`

Formats diff as human-readable text.

```typescript
const text = formatDiff(diff);
// "Modified: /submodels/0/submodelElements/0/value
//    - Old: 'Acme Corp'
//    + New: 'Acme Corporation'"
```

---

### IDTA Module (`@aas-ai-editor/core/idta`)

Load and validate against IDTA submodel templates.

```typescript
import {
  loadTemplate,
  getTemplateRegistry,
  validateAgainstTemplate,
} from '@aas-ai-editor/core/idta';
```

#### `loadTemplate(semanticId)`

Loads a template by its semantic ID.

```typescript
const template = await loadTemplate(
  'https://admin-shell.io/zvei/nameplate/2/0/Nameplate'
);
```

#### `validateAgainstTemplate(submodel, template)`

Validates a submodel against an IDTA template.

```typescript
const result = validateAgainstTemplate(submodel, template);

if (!result.valid) {
  for (const error of result.errors) {
    console.log(`${error.path}: ${error.message}`);
  }
}
```

#### `getTemplateRegistry()`

Returns the registry of available templates.

```typescript
const registry = getTemplateRegistry();
for (const [semanticId, template] of registry.entries()) {
  console.log(`${template.name}: ${semanticId}`);
}
```

---

## Requirements

- Node.js 20+
- TypeScript 5+ (for type definitions)

## Related Packages

- [`@aas-ai-editor/mcp-server`](https://www.npmjs.com/package/@aas-ai-editor/mcp-server) - MCP server for AI-assisted editing
- [AAS AI Editor](https://github.com/hadijannat/aas-ai-editor) - Full application with web UI

## License

MIT
