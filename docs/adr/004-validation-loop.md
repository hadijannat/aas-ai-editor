# ADR-004: Self-Correcting Validation Loop

## Status

Accepted

## Context

AI-generated content may contain errors:
- Schema violations (wrong types, missing required fields)
- Reference errors (invalid idShort references)
- Template constraint violations (IDTA submodel rules)
- Semantic errors (invalid value ranges, inconsistent data)

We need a strategy for handling these errors while maintaining good UX.

## Decision

Implement a **two-tier validation with self-correcting loop**.

## Rationale

### Two-Tier Validation

**Tier 1: Fast Validation (TypeScript)**
- Runs synchronously in MCP server
- Checks structure, types, required fields
- Validates references within document
- Fast enough for real-time feedback (< 100ms)

**Tier 2: Deep Validation (Python)**
- Runs in separate service
- Uses aas-test-engines for full compliance
- Checks semantic constraints
- Slower but comprehensive (1-5 seconds)

### Self-Correcting Loop

```
┌──────────────────────────────────────────────────────────────────┐
│                    Self-Correcting Loop                           │
└──────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   AI Call   │
                    │ (Generate)  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Fast     │
              ┌────▶│ Validation  │◀────┐
              │     └──────┬──────┘     │
              │            │            │
              │     ┌──────┴──────┐     │
              │     │             │     │
              │     ▼             ▼     │
              │ ┌───────┐   ┌────────┐  │
              │ │ Pass  │   │ Errors │  │
              │ └───┬───┘   └───┬────┘  │
              │     │           │       │
              │     │     ┌─────┴─────┐ │
              │     │     │ Fixable?  │ │
              │     │     └─────┬─────┘ │
              │     │           │       │
              │     │     ┌─────┴─────┐ │
              │     │     │           │ │
              │     │     ▼           ▼ │
              │     │ ┌───────┐ ┌──────┐│
              │     │ │  Yes  │ │  No  ││
              │     │ └───┬───┘ └──┬───┘│
              │     │     │        │    │
              │     │     │        ▼    │
              │     │     │   ┌────────┐│
              │     │     │   │ Abort  ││
              │     │     │   │+Report ││
              │     │     │   └────────┘│
              │     │     │             │
              │     │     ▼             │
              │     │ ┌────────────┐    │
              │     │ │ attempts<3?│    │
              │     │ └─────┬──────┘    │
              │     │       │           │
              │     │  ┌────┴────┐      │
              │     │  │         │      │
              │     │  ▼         ▼      │
              │     │ Yes       No      │
              │     │  │         │      │
              │     │  │    ┌────┴────┐ │
              │     │  │    │ Return  │ │
              │     │  │    │ w/warns │ │
              │     │  │    └─────────┘ │
              │     │  │                │
              │     │  ▼                │
              │     │ ┌─────────────┐   │
              │     │ │  AI Call    │   │
              └─────┼─│  (Correct)  │───┘
                    │ └─────────────┘
                    │
                    ▼
              ┌───────────┐
              │  Return   │
              │  Patches  │
              └───────────┘
```

### Error Classification

```typescript
enum ErrorSeverity {
  WARNING,    // Non-blocking, show to user
  FIXABLE,    // AI can attempt correction
  CRITICAL,   // Requires human intervention
}

function classifyError(error: ValidationError): ErrorSeverity {
  // Type mismatches are usually fixable
  if (error.code === 'TYPE_MISMATCH') return ErrorSeverity.FIXABLE;

  // Missing required fields - AI can add defaults
  if (error.code === 'REQUIRED_FIELD') return ErrorSeverity.FIXABLE;

  // Invalid references - AI can search for correct target
  if (error.code === 'INVALID_REFERENCE') return ErrorSeverity.FIXABLE;

  // Semantic violations - need human decision
  if (error.code === 'SEMANTIC_VIOLATION') return ErrorSeverity.CRITICAL;

  // Constraint violations depend on type
  if (error.code === 'CONSTRAINT_VIOLATION') {
    return error.constraint?.autoFixable
      ? ErrorSeverity.FIXABLE
      : ErrorSeverity.CRITICAL;
  }

  return ErrorSeverity.WARNING;
}
```

### Correction Prompt

```typescript
const correctionPrompt = `
The following patches failed validation:

${JSON.stringify(patches, null, 2)}

Errors:
${errors.map(e => `- ${e.path}: ${e.message}`).join('\n')}

Please generate corrected patches that fix these errors.
Maintain the user's original intent while ensuring validity.
`;
```

## Implementation

```typescript
async function generateWithValidation(
  request: EditRequest,
  maxAttempts = 3
): Promise<PatchResult> {
  let attempt = 0;
  let patches: AasPatchOp[] = [];
  let errors: ValidationError[] = [];

  while (attempt < maxAttempts) {
    attempt++;

    // Generate (or correct)
    patches = attempt === 1
      ? await generatePatches(request)
      : await correctPatches(patches, errors);

    // Validate
    const result = await fastValidate(patches);

    if (result.valid) {
      return { success: true, patches, attempts: attempt };
    }

    // Classify errors
    errors = result.errors;
    const criticalErrors = errors.filter(
      e => classifyError(e) === ErrorSeverity.CRITICAL
    );

    if (criticalErrors.length > 0) {
      return {
        success: false,
        patches,
        errors: criticalErrors,
        message: 'Critical errors require human review'
      };
    }
  }

  // Max attempts reached
  return {
    success: false,
    patches,
    errors,
    message: `Could not auto-correct after ${maxAttempts} attempts`
  };
}
```

## Consequences

### Positive

- Better UX: most errors fixed automatically
- Reduced round-trips: AI corrects before showing to user
- Learning: AI sees its own errors, may improve
- Graceful degradation: critical errors still surfaced

### Negative

- Increased latency for corrections
- More API calls when errors occur
- Risk of infinite loop (mitigated by max attempts)
- AI might "fix" errors in unexpected ways

### Mitigations

- Hard limit on correction attempts (3)
- Classify which errors are auto-fixable
- Show user when corrections were made
- Log all correction attempts for analysis

## References

- [aas-test-engines](https://github.com/admin-shell-io/aas-test-engines)
- [AAS Metamodel Spec](https://industrialdigitaltwin.org/content-hub/aasspecifications)
