/**
 * Diff types
 */

/**
 * Type of change
 */
export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged';

/**
 * A single diff entry
 */
export interface DiffEntry {
  /** Type of change */
  type: DiffType;

  /** JSON Pointer path in the 'before' document (for removed/modified) */
  beforePath?: string;

  /** JSON Pointer path in the 'after' document (for added/modified) */
  afterPath?: string;

  /** The element's idShort (for context) */
  idShort?: string;

  /** The element's semanticId (for context) */
  semanticId?: string;

  /** Value before change */
  beforeValue?: unknown;

  /** Value after change */
  afterValue?: unknown;

  /** Human-readable description of the change */
  description?: string;
}

/**
 * Complete diff result
 */
export interface DiffResult {
  /** Total number of changes */
  changeCount: number;

  /** Number of additions */
  additions: number;

  /** Number of removals */
  removals: number;

  /** Number of modifications */
  modifications: number;

  /** Individual diff entries */
  entries: DiffEntry[];

  /** Whether the documents are identical */
  identical: boolean;
}
