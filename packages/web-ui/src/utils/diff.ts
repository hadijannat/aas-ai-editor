/**
 * Diff Utilities
 *
 * Helper functions for displaying JSON Patch operations in a human-readable format.
 */

/**
 * AAS Patch Operation (matches @aas-ai-editor/core schema)
 */
export interface AasPatchOp {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
  semanticId?: string;
  idShort?: string;
  modelType?: string;
  reason?: string;
  aiGenerated?: boolean;
  approvalTier?: number;
}

/**
 * Display configuration for patch operations
 */
export interface PatchDisplay {
  op: AasPatchOp['op'];
  icon: string;
  label: string;
  colorClass: string;
}

/**
 * Get display configuration for a patch operation
 */
export function getPatchDisplay(op: AasPatchOp['op']): PatchDisplay {
  const displays: Record<AasPatchOp['op'], PatchDisplay> = {
    add: { op: 'add', icon: '+', label: 'Added', colorClass: 'diff-add' },
    remove: { op: 'remove', icon: '-', label: 'Removed', colorClass: 'diff-remove' },
    replace: { op: 'replace', icon: '~', label: 'Modified', colorClass: 'diff-modify' },
    move: { op: 'move', icon: '↔', label: 'Moved', colorClass: 'diff-move' },
    copy: { op: 'copy', icon: '⊕', label: 'Copied', colorClass: 'diff-move' },
    test: { op: 'test', icon: '?', label: 'Test', colorClass: 'diff-test' },
  };
  return displays[op];
}

/**
 * Parse a JSON Pointer path into segments
 * @example "/submodels/0/submodelElements/3/value" -> ["submodels", "0", "submodelElements", "3", "value"]
 */
export function parsePath(path: string): string[] {
  if (!path || path === '') return [];
  // Remove leading slash and split
  return path.slice(1).split('/').map(decodeJsonPointer);
}

/**
 * Decode a JSON Pointer segment (RFC 6901)
 */
function decodeJsonPointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Format a path for display with human-readable segment names
 * @example "/submodels/0/submodelElements/3/value" -> "submodels[0].submodelElements[3].value"
 */
export function formatPath(path: string): string {
  const segments = parsePath(path);
  return segments
    .map((seg, i) => {
      // If segment is a number, format as array index
      if (/^\d+$/.test(seg)) {
        return `[${seg}]`;
      }
      // Otherwise, format as property access
      return i === 0 ? seg : `.${seg}`;
    })
    .join('');
}

/**
 * Get a human-readable description of the target location
 * @example "/submodels/0/submodelElements/3/value" -> "value in submodelElements[3]"
 */
export function describePathTarget(path: string): string {
  const segments = parsePath(path);
  if (segments.length === 0) return 'root';

  const lastSeg = segments[segments.length - 1];

  // Special case: appending to array with /-
  if (lastSeg === '-') {
    const parentSeg = segments[segments.length - 2] || 'array';
    return `new item in ${parentSeg}`;
  }

  // If last segment is a number, describe the indexed item
  if (/^\d+$/.test(lastSeg)) {
    const parentSeg = segments[segments.length - 2] || 'array';
    return `${parentSeg}[${lastSeg}]`;
  }

  return lastSeg;
}

/**
 * Get a value from a document using a JSON Pointer path
 */
export function getValueAtPath(doc: unknown, path: string): unknown {
  if (!doc || !path || path === '') return doc;

  const segments = parsePath(path);
  let current: unknown = doc;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = parseInt(segment, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Format a value for display
 */
export function formatValue(value: unknown, maxLength = 100): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';

  if (typeof value === 'string') {
    const escaped = value.length > maxLength ? value.slice(0, maxLength) + '...' : value;
    return `"${escaped}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.length} items]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';

    // Show idShort if available
    const obj = value as Record<string, unknown>;
    if (obj.idShort) {
      return `{idShort: "${obj.idShort}"${keys.length > 1 ? ', ...' : ''}}`;
    }

    // Show first few keys
    const preview = keys.slice(0, 2).join(', ');
    return `{${preview}${keys.length > 2 ? ', ...' : ''}}`;
  }

  return String(value);
}

/**
 * Generate a human-readable description of a patch operation
 */
export function describeOp(patch: AasPatchOp): string {
  const target = describePathTarget(patch.path);
  const display = getPatchDisplay(patch.op);

  switch (patch.op) {
    case 'add':
      if (patch.idShort) {
        return `Add ${patch.modelType || 'element'} "${patch.idShort}" to ${target}`;
      }
      return `Add value to ${target}`;

    case 'remove':
      if (patch.idShort) {
        return `Remove ${patch.modelType || 'element'} "${patch.idShort}"`;
      }
      return `Remove ${target}`;

    case 'replace':
      return `Change ${target}`;

    case 'move':
      return `Move ${target} from ${patch.from ? describePathTarget(patch.from) : 'source'}`;

    case 'copy':
      return `Copy to ${target} from ${patch.from ? describePathTarget(patch.from) : 'source'}`;

    case 'test':
      return `Test ${target}`;

    default:
      return `${display.label} ${target}`;
  }
}

/**
 * Check if a value is a primitive (string, number, boolean, null, undefined)
 */
export function isPrimitive(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== 'object';
}

/**
 * Deep compare two values for equality
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}
