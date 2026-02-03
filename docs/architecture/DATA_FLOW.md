# Data Flow

This document describes the data flow patterns in the AAS AI Editor.

## 1. Document Loading Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │────▶│  Web UI  │────▶│   MCP    │────▶│   Core   │
│  Upload  │     │          │     │  Server  │     │  Parser  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                                  │
                      │           ┌──────────────────────┘
                      │           │
                      │           ▼
                      │     ┌──────────┐
                      │     │Environment│
                      │     │  (JSON)   │
                      │     └──────────┘
                      │           │
                      │           ▼
                      │     ┌──────────┐
                      │◀────│ Document │
                      │     │  State   │
                             └──────────┘

1. User uploads AASX file via drag-drop or file picker
2. Web UI sends file to MCP server via `aas_document_open` tool
3. Core parser extracts Environment JSON from AASX (OPC package)
4. Document state is established in session
5. UI receives initial structure for tree navigation
```

## 2. AI-Assisted Edit Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │────▶│  Web UI  │────▶│   MCP    │────▶│  Claude  │
│ Request  │     │          │     │  Server  │     │    AI    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                       │                │
                                       │◀───────────────┘
                                       │   Proposed Patches
                                       ▼
                                 ┌──────────┐
                                 │   Fast   │
                                 │Validation│
                                 └──────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
              ┌──────────┐       ┌──────────┐       ┌──────────┐
              │   Pass   │       │  Errors  │       │ Critical │
              │          │       │(Fixable) │       │  Errors  │
              └──────────┘       └──────────┘       └──────────┘
                    │                  │                  │
                    ▼                  ▼                  ▼
              ┌──────────┐       ┌──────────┐       ┌──────────┐
              │  Return  │       │AI Auto-  │       │  Abort   │
              │ Patches  │       │Correct   │       │ + Report │
              └──────────┘       │(≤3 tries)│       └──────────┘
                    │            └──────────┘
                    │                  │
                    ▼                  ▼
              ┌────────────────────────────┐
              │      Approval Panel        │
              │  • Show diff               │
              │  • Explain changes         │
              │  • User approves/rejects   │
              └────────────────────────────┘
                    │
                    ▼ (if approved)
              ┌──────────┐
              │  Apply   │
              │ Patches  │
              └──────────┘

1. User requests change (natural language or structured)
2. MCP server builds context and sends to Claude
3. Claude generates JSON Patch operations
4. Fast validation checks patches
5. If errors: AI attempts auto-correction (max 3 times)
6. Valid patches go to approval panel
7. User reviews diff and approves/rejects
8. Approved patches are applied to document state
```

## 3. Validation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        Validation Pipeline                        │
└──────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Input   │────▶│   Fast   │────▶│  Deep    │────▶│ Template │
│ (Patches)│     │Validation│     │Validation│     │Validation│
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                │                │
                      ▼                ▼                ▼
                 ┌──────────┐    ┌──────────┐    ┌──────────┐
                 │Structure │    │ Semantic │    │Constraint│
                 │  Errors  │    │  Errors  │    │ Errors   │
                 └──────────┘    └──────────┘    └──────────┘
                      │                │                │
                      └────────────────┴────────────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │ Combined Result│
                              │ • errors[]     │
                              │ • warnings[]   │
                              │ • suggestions[]│
                              └────────────────┘

Fast Validation (TypeScript - Core):
- JSON Schema validation
- Reference integrity
- Required fields
- Type checking

Deep Validation (Python Service):
- aas-test-engines integration
- Semantic constraints
- Cross-reference validation
- Business rules

Template Validation (TypeScript - Core):
- IDTA template constraints
- Cardinality rules
- Value ranges
- Enum restrictions
```

## 4. Patch Application Flow

```
┌──────────┐
│ Document │
│  State   │
│ (v1.0)   │
└──────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Patch Operation                            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  {                                                          │ │
│  │    "op": "replace",                                         │ │
│  │    "path": "/submodels/0/submodelElements/3/value",        │ │
│  │    "value": "NewManufacturerName",                         │ │
│  │    "semanticId": "0173-1#02-AAO677#002"                    │ │
│  │  }                                                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  1. Record current value (for undo)                              │
│  2. Validate patch operation                                      │
│  3. Apply to document state                                       │
│  4. Emit change event                                             │
│  5. Push to undo stack                                            │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────┐     ┌──────────┐
│ Document │     │  Undo    │
│  State   │     │  Stack   │
│ (v1.1)   │     │ [patch]  │
└──────────┘     └──────────┘
```

## 5. Template Import Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│   User   │────▶│ Template │────▶│ Compiled │
│ Selects  │     │ Registry │     │ Schema   │
│ Template │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘
                                       │
                                       ▼
                               ┌──────────────┐
                               │   Generate   │
                               │   Skeleton   │
                               │   Structure  │
                               └──────────────┘
                                       │
                                       ▼
                               ┌──────────────┐
                               │   Prefill    │
                               │  User Data   │
                               │  (optional)  │
                               └──────────────┘
                                       │
                                       ▼
                               ┌──────────────┐
                               │   Generate   │
                               │   Patches    │
                               └──────────────┘
                                       │
                                       ▼
                               ┌──────────────┐
                               │   Approval   │
                               │    Flow      │
                               └──────────────┘
```

## State Management

The document state is managed centrally in the MCP server session:

```typescript
interface DocumentSession {
  id: string;
  filename: string;
  environment: Environment;        // Current AAS Environment
  undoStack: AasPatchOp[][];      // Undo history (grouped by operation)
  redoStack: AasPatchOp[][];      // Redo history
  pendingPatches: PendingPatch[]; // Awaiting approval
  validationCache: Map<string, ValidationResult>;
  lastModified: Date;
}
```
