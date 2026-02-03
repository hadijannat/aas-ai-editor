# ADR-003: AASX Patch Model

## Status

Accepted

## Context

We need a mechanism to:
1. Track all modifications to AAS documents
2. Enable undo/redo functionality
3. Allow AI to propose changes for human review
4. Support atomic batched operations
5. Maintain audit trail

Options considered:
1. **Mutable State**: Direct object manipulation
2. **Immutable State + Reducers**: Redux-style state management
3. **JSON Patch (RFC 6902)**: Standard patch operations
4. **Custom Diff Format**: AAS-specific operation types

## Decision

Use **JSON Patch (RFC 6902)** extended with AAS-specific metadata.

## Rationale

### Why JSON Patch?

1. **Standard Format**: Well-defined RFC with wide tooling support
2. **Reversible**: Can generate inverse patches for undo
3. **Composable**: Multiple patches can be batched
4. **Transport-Friendly**: JSON, easy to serialize
5. **Path-Based**: Explicit about what changes

### Extended Schema

```typescript
// Base JSON Patch operations
type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'copy'; from: string; path: string }
  | { op: 'test'; path: string; value: unknown };

// AAS-extended patch operation
interface AasPatchOp extends JsonPatchOp {
  // AAS-specific metadata
  semanticId?: string;      // Links to IDTA concept
  idShort?: string;         // Target element idShort
  modelType?: string;       // AAS metamodel type

  // Operation metadata
  reason?: string;          // Human-readable explanation
  aiGenerated?: boolean;    // Was this AI-proposed?
  approvalTier?: ApprovalTier;

  // Validation context
  templateConstraint?: string;  // IDTA template constraint ID
}
```

### Path Structure

JSON Pointer paths follow AAS Environment structure:

```
/assetAdministrationShells/0/idShort
/submodels/0/submodelElements/3/value
/submodels/0/submodelElements/3/semanticId/keys/0/value
/conceptDescriptions/0/embeddedDataSpecifications/0/...
```

## Implementation

### Patch Application

```typescript
function applyPatch(
  env: Environment,
  patches: AasPatchOp[]
): { result: Environment; inverse: AasPatchOp[] } {
  const inverse: AasPatchOp[] = [];
  let current = structuredClone(env);

  for (const patch of patches) {
    // Record inverse for undo
    inverse.unshift(createInverse(current, patch));

    // Apply patch
    current = jsonPatch.applyOperation(current, patch).newDocument;
  }

  return { result: current, inverse };
}
```

### Diff Generation

```typescript
function generateDiff(
  before: Environment,
  after: Environment
): AasPatchOp[] {
  // Use AAS-aware comparison
  // Match by semanticId first, then idShort
  return aasAwareDiff(before, after);
}
```

### Approval Tiers

```typescript
enum ApprovalTier {
  LOW = 1,      // Metadata: descriptions, comments
  MEDIUM = 2,   // Structure: add/remove elements within submodel
  HIGH = 3,     // References: cross-submodel, external refs
  CRITICAL = 4, // Identity: globalAssetId, AAS id changes
}

function classifyPatch(patch: AasPatchOp): ApprovalTier {
  // Path-based classification
  if (patch.path.includes('/globalAssetId')) return ApprovalTier.CRITICAL;
  if (patch.path.includes('/id') && !patch.path.includes('/idShort')) {
    return ApprovalTier.CRITICAL;
  }
  if (patch.op === 'remove') return ApprovalTier.HIGH;
  // ... more rules
}
```

## Consequences

### Positive

- Standard format, broad tooling support
- Clean separation: AI proposes patches, human approves
- Built-in undo/redo via inverse patches
- Audit trail is sequence of patches
- Easy to validate patches before applying

### Negative

- JSON Pointer paths can be fragile (array indices change)
- Large changes produce many operations
- Need custom logic for AAS-aware matching

### Mitigations

- Use semanticId/idShort matching before paths
- Batch related operations into atomic groups
- Implement path rebasing for concurrent edits

## References

- [RFC 6902 - JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902)
- [RFC 6901 - JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901)
- [fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch)
