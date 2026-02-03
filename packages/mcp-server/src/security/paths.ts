/**
 * Path Security
 *
 * Provides path validation and sandboxing to prevent
 * directory traversal and unauthorized file access.
 */

import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Path security configuration
 */
export interface PathConfig {
  /** Allowed directories for file operations (absolute paths) */
  allowedDirectories: string[];

  /** Whether to allow operations outside allowed directories */
  strictMode: boolean;

  /** Maximum path length */
  maxPathLength: number;
}

/**
 * Default path configuration
 */
export const DEFAULT_PATH_CONFIG: PathConfig = {
  allowedDirectories: [],
  strictMode: true,
  maxPathLength: 4096,
};

/**
 * Path validation result
 */
export interface PathValidationResult {
  valid: boolean;
  normalizedPath?: string;
  error?: string;
}

/**
 * Recursively decode URL-encoded strings to detect multi-level encoding attacks
 */
function fullyDecodeUri(input: string, maxIterations = 3): string {
  let current = input;
  let iteration = 0;

  while (iteration < maxIterations) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        // No more decoding possible
        break;
      }
      current = decoded;
      iteration++;
    } catch {
      // Invalid encoding, stop decoding
      break;
    }
  }

  return current;
}

/**
 * Check if a path is safe (no traversal sequences)
 */
export function isPathSafe(inputPath: string): boolean {
  // Check for null bytes (path truncation attack)
  if (inputPath.includes('\0')) {
    return false;
  }

  // Check for directory traversal patterns BEFORE normalization
  // This is critical because normalization would hide the attack
  if (inputPath.includes('..')) {
    return false;
  }

  // Check for URL-encoded traversal attempts (single encoding)
  if (inputPath.includes('%2e') || inputPath.includes('%2E')) {
    return false;
  }
  if (inputPath.includes('%2f') || inputPath.includes('%2F')) {
    return false;
  }
  if (inputPath.includes('%5c') || inputPath.includes('%5C')) {
    return false;
  }

  // Check for double-encoded traversal attempts (%25 = encoded %)
  // %252e%252e decodes to %2e%2e which decodes to ..
  if (inputPath.includes('%25')) {
    // Fully decode and re-check for traversal patterns
    const decoded = fullyDecodeUri(inputPath);
    if (decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) {
      return false;
    }
  }

  return true;
}

/**
 * Validate and normalize a path against security rules
 */
export function validatePath(
  inputPath: string,
  config: Partial<PathConfig> = {}
): PathValidationResult {
  const fullConfig: PathConfig = { ...DEFAULT_PATH_CONFIG, ...config };

  // Check path length
  if (inputPath.length > fullConfig.maxPathLength) {
    return {
      valid: false,
      error: `Path exceeds maximum length of ${fullConfig.maxPathLength} characters`,
    };
  }

  // Check for basic path safety
  if (!isPathSafe(inputPath)) {
    return {
      valid: false,
      error: 'Path contains invalid sequences (directory traversal detected)',
    };
  }

  // Normalize and resolve to absolute path
  const normalizedPath = path.resolve(inputPath);

  // In strict mode, check against allowed directories
  if (fullConfig.strictMode && fullConfig.allowedDirectories.length > 0) {
    const isAllowed = fullConfig.allowedDirectories.some((allowedDir) => {
      const normalizedAllowed = path.resolve(allowedDir);
      // Path must start with allowed directory
      return (
        normalizedPath === normalizedAllowed ||
        normalizedPath.startsWith(normalizedAllowed + path.sep)
      );
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `Path is outside allowed directories. Allowed: ${fullConfig.allowedDirectories.join(', ')}`,
      };
    }
  }

  return {
    valid: true,
    normalizedPath,
  };
}

/**
 * Ensure a directory exists and is within allowed paths
 */
export async function ensureSafeDirectory(
  dirPath: string,
  config: Partial<PathConfig> = {}
): Promise<PathValidationResult> {
  const validation = validatePath(dirPath, config);

  if (!validation.valid) {
    return validation;
  }

  try {
    await fs.mkdir(validation.normalizedPath!, { recursive: true });
    return validation;
  } catch (error) {
    return {
      valid: false,
      error: `Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get workspace directory from environment or default
 */
export function getWorkspaceDirectory(): string {
  return process.env.MCP_WORKSPACE_DIR || process.cwd();
}

/**
 * Load allowed directories from environment
 */
export function loadAllowedDirectoriesFromEnv(): string[] {
  const envDirs = process.env.MCP_ALLOWED_DIRECTORIES;
  if (!envDirs) {
    // Default to workspace directory if not specified
    return [getWorkspaceDirectory()];
  }

  return envDirs
    .split(':')
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .map((d) => path.resolve(d)); // Normalize to absolute paths
}

/**
 * Create a path validator with pre-configured settings
 */
export function createPathValidator(config: Partial<PathConfig> = {}) {
  const fullConfig: PathConfig = {
    ...DEFAULT_PATH_CONFIG,
    allowedDirectories: loadAllowedDirectoriesFromEnv(),
    ...config,
  };

  return {
    validate: (inputPath: string) => validatePath(inputPath, fullConfig),
    isAllowed: (inputPath: string) => validatePath(inputPath, fullConfig).valid,
    normalize: (inputPath: string) => {
      const result = validatePath(inputPath, fullConfig);
      if (!result.valid) {
        throw new Error(result.error);
      }
      return result.normalizedPath!;
    },
    config: fullConfig,
  };
}
