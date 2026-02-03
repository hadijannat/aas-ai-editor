/**
 * Diff formatting for display
 */

import type { DiffResult, DiffType } from './types.js';

/**
 * Format options
 */
export interface FormatOptions {
  /** Include unchanged entries */
  includeUnchanged?: boolean;
  /** Include paths in output */
  includePaths?: boolean;
  /** Maximum value preview length */
  maxValueLength?: number;
}

/**
 * Format a diff result for display
 *
 * @param diff - The diff result
 * @param options - Formatting options
 * @returns Formatted string
 */
export function formatDiff(diff: DiffResult, options: FormatOptions = {}): string {
  const { includeUnchanged = false, includePaths = true, maxValueLength = 50 } = options;

  if (diff.identical) {
    return 'No changes detected.';
  }

  const lines: string[] = [];

  // Summary
  lines.push(`Changes: ${diff.changeCount} total`);
  lines.push(`  + ${diff.additions} additions`);
  lines.push(`  - ${diff.removals} removals`);
  lines.push(`  ~ ${diff.modifications} modifications`);
  lines.push('');

  // Details
  for (const entry of diff.entries) {
    if (entry.type === 'unchanged' && !includeUnchanged) continue;

    const prefix = getTypePrefix(entry.type);
    const path = includePaths ? ` at ${entry.afterPath || entry.beforePath}` : '';

    let line = `${prefix} ${entry.description || entry.idShort || 'Unknown'}${path}`;

    // Add value info for modifications
    if (entry.type === 'modified' && entry.beforeValue !== undefined) {
      const before = truncateValue(entry.beforeValue, maxValueLength);
      const after = truncateValue(entry.afterValue, maxValueLength);
      line += `\n    ${before} → ${after}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

function getTypePrefix(type: DiffType): string {
  switch (type) {
    case 'added':
      return '[+]';
    case 'removed':
      return '[-]';
    case 'modified':
      return '[~]';
    case 'unchanged':
      return '[ ]';
  }
}

function truncateValue(value: unknown, maxLength: number): string {
  const str = JSON.stringify(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a unified diff format
 */
export function formatUnifiedDiff(diff: DiffResult): string {
  const lines: string[] = [];

  for (const entry of diff.entries) {
    switch (entry.type) {
      case 'removed':
        lines.push(`- ${entry.idShort}: ${JSON.stringify(entry.beforeValue)}`);
        break;
      case 'added':
        lines.push(`+ ${entry.idShort}: ${JSON.stringify(entry.afterValue)}`);
        break;
      case 'modified':
        lines.push(`- ${entry.idShort}: ${JSON.stringify(entry.beforeValue)}`);
        lines.push(`+ ${entry.idShort}: ${JSON.stringify(entry.afterValue)}`);
        break;
    }
  }

  return lines.join('\n');
}
