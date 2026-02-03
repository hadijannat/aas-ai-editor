# MCP Tools Taxonomy

This document describes the MCP tools exposed by the AAS AI Editor server.

## Tool Categories

### 1. Document Tools

Tools for managing the overall document lifecycle.

#### `aas_document_open`
Open an AASX file for editing.

```typescript
{
  name: "aas_document_open",
  description: "Open an AASX file from a URL or base64 content",
  inputSchema: {
    type: "object",
    properties: {
      source: {
        oneOf: [
          { type: "string", format: "uri" },
          { type: "string", contentEncoding: "base64" }
        ]
      },
      filename: { type: "string" }
    },
    required: ["source"]
  }
}
```

#### `aas_document_save`
Export the current document state.

#### `aas_document_close`
Close the current document and clean up resources.

### 2. Query Tools

Tools for reading and navigating AAS structures.

#### `aas_query_structure`
Get the hierarchical structure of the document.

```typescript
{
  name: "aas_query_structure",
  description: "Get document structure as a navigable tree",
  inputSchema: {
    type: "object",
    properties: {
      depth: { type: "integer", minimum: 1, maximum: 10, default: 3 },
      filter: {
        type: "object",
        properties: {
          modelType: { type: "array", items: { type: "string" } },
          semanticId: { type: "string" }
        }
      }
    }
  }
}
```

#### `aas_query_element`
Get details of a specific element by path.

#### `aas_query_search`
Search for elements matching criteria.

### 3. Edit Tools

Tools for modifying AAS content. All edit tools return patches for approval.

#### `aas_edit_property`
Edit a property value.

```typescript
{
  name: "aas_edit_property",
  description: "Edit a property's value with validation",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "JSON Pointer to the property" },
      value: { description: "New value (type must match property valueType)" },
      reason: { type: "string", description: "Explanation for the change" }
    },
    required: ["path", "value"]
  }
}
```

#### `aas_edit_add_element`
Add a new submodel element.

#### `aas_edit_remove_element`
Remove a submodel element.

#### `aas_edit_move_element`
Move an element to a different location.

#### `aas_edit_batch`
Apply multiple edits atomically.

### 4. Validate Tools

Tools for validation at different levels.

#### `aas_validate_fast`
Quick structural validation (TypeScript-based).

```typescript
{
  name: "aas_validate_fast",
  description: "Fast structural validation of current state or proposed patches",
  inputSchema: {
    type: "object",
    properties: {
      patches: {
        type: "array",
        items: { $ref: "#/definitions/AasPatchOp" },
        description: "Optional patches to validate before applying"
      },
      scope: {
        type: "string",
        enum: ["full", "changed"],
        default: "changed"
      }
    }
  }
}
```

#### `aas_validate_deep`
Full semantic validation (delegates to Python service).

#### `aas_validate_template`
Validate against IDTA template constraints.

### 5. Import Tools

Tools for importing content from various sources.

#### `aas_import_template`
Create structure from an IDTA template.

```typescript
{
  name: "aas_import_template",
  description: "Create submodel structure from IDTA template",
  inputSchema: {
    type: "object",
    properties: {
      templateId: { type: "string", description: "IDTA template identifier" },
      targetPath: { type: "string", description: "Where to insert the submodel" },
      prefill: {
        type: "object",
        description: "Values to prefill in the template"
      }
    },
    required: ["templateId"]
  }
}
```

#### `aas_import_csv`
Import data from CSV into submodel elements.

#### `aas_import_json`
Import from JSON with mapping rules.

## Tool Response Format

All tools return a standardized response:

```typescript
interface ToolResponse {
  success: boolean;
  data?: unknown;
  patches?: AasPatchOp[];        // For edit tools
  approvalTier?: ApprovalTier;   // Required approval level
  validationResult?: {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

## Approval Tiers

| Tier | Value | Auto-Approve | Description |
|------|-------|--------------|-------------|
| LOW | 1 | Optional | Metadata changes, comments |
| MEDIUM | 2 | No | Structural changes within submodel |
| HIGH | 3 | No | Cross-references, deletions |
| CRITICAL | 4 | No (double confirm) | External identifiers, AAS-level changes |

## Error Codes

| Code | Description |
|------|-------------|
| `DOCUMENT_NOT_OPEN` | No document is currently open |
| `INVALID_PATH` | JSON Pointer doesn't resolve to valid element |
| `TYPE_MISMATCH` | Value type doesn't match property valueType |
| `VALIDATION_FAILED` | Fast validation found errors |
| `TEMPLATE_NOT_FOUND` | Referenced IDTA template doesn't exist |
| `CONSTRAINT_VIOLATION` | Template constraint was violated |
| `AI_CONTEXT_OVERFLOW` | Context too large for AI processing |
