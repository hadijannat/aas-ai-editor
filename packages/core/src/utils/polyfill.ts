/**
 * Polyfills for Node.js < 17 compatibility
 */

/**
 * Deep clone an object using structuredClone if available,
 * otherwise fall back to JSON serialization.
 *
 * Note: JSON fallback doesn't handle:
 * - undefined values (become null in arrays, omitted in objects)
 * - Functions, Symbols, BigInt
 * - Circular references
 * - Date objects (become strings)
 * - Map, Set, RegExp, Error objects
 *
 * For AAS data which is JSON-serializable, this is safe.
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  // Fallback for Node < 17
  return JSON.parse(JSON.stringify(value));
}
