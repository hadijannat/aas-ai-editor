/**
 * Patch classification for approval tiers
 */

import { type AasPatchOp, ApprovalTier } from './schema.js';

/**
 * Path patterns that determine approval tier
 */
const CRITICAL_PATTERNS = [
  /^\/assetAdministrationShells\/\d+\/id$/,
  /^\/assetAdministrationShells\/\d+\/assetInformation\/globalAssetId$/,
  /^\/submodels\/\d+\/id$/,
  /^\/conceptDescriptions\/\d+\/id$/,
];

const HIGH_PATTERNS = [
  /^\/assetAdministrationShells\/\d+\/submodels/,
  /^\/assetAdministrationShells\/\d+\/derivedFrom/,
  /\/semanticId/,
];

const LOW_PATTERNS = [
  /\/description/,
  /\/displayName/,
  /\/administration/,
];

/**
 * Classify a patch operation into an approval tier
 *
 * @param patch - The patch to classify
 * @returns The appropriate approval tier
 */
export function classifyPatchTier(patch: AasPatchOp): ApprovalTier {
  // If already classified, return that
  if (patch.approvalTier !== undefined) {
    return patch.approvalTier;
  }

  const { op, path } = patch;

  // Remove operations are always at least HIGH
  if (op === 'remove') {
    // Check if it's critical
    if (CRITICAL_PATTERNS.some((p) => p.test(path))) {
      return ApprovalTier.CRITICAL;
    }
    return ApprovalTier.HIGH;
  }

  // Check critical patterns
  if (CRITICAL_PATTERNS.some((p) => p.test(path))) {
    return ApprovalTier.CRITICAL;
  }

  // Check high patterns
  if (HIGH_PATTERNS.some((p) => p.test(path))) {
    return ApprovalTier.HIGH;
  }

  // Check low patterns (metadata only)
  if (LOW_PATTERNS.some((p) => p.test(path))) {
    return ApprovalTier.LOW;
  }

  // Default to medium for structural changes
  return ApprovalTier.MEDIUM;
}

/**
 * Get the highest approval tier from a list of patches
 */
export function getMaxApprovalTier(patches: AasPatchOp[]): ApprovalTier {
  return patches.reduce<ApprovalTier>((max, patch) => {
    const tier = classifyPatchTier(patch);
    return tier > max ? tier : max;
  }, ApprovalTier.LOW);
}

/**
 * Get human-readable description of an approval tier
 */
export function getApprovalTierDescription(tier: ApprovalTier): string {
  switch (tier) {
    case ApprovalTier.LOW:
      return 'Low - Metadata changes only (descriptions, comments)';
    case ApprovalTier.MEDIUM:
      return 'Medium - Structural changes within submodel';
    case ApprovalTier.HIGH:
      return 'High - Cross-references or deletions';
    case ApprovalTier.CRITICAL:
      return 'Critical - Identity changes (requires double confirmation)';
    default:
      return 'Unknown';
  }
}
