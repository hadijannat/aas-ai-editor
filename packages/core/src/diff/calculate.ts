/**
 * Diff calculation
 */

import type {
  Environment,
  Submodel,
  SubmodelElement,
  AssetAdministrationShell,
  ConceptDescription,
  Reference,
  LangStringSet,
} from '../aas/types.js';
import type { DiffResult, DiffEntry } from './types.js';

/**
 * Compare two Reference objects for equality
 */
function referencesEqual(a: Reference | undefined, b: Reference | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.keys.length !== b.keys.length) return false;
  return a.keys.every((keyA, i) => {
    const keyB = b.keys[i];
    return keyA.type === keyB.type && keyA.value === keyB.value;
  });
}

/**
 * Compare two LangStringSet arrays for equality
 */
function langStringSetsEqual(
  a: LangStringSet | undefined,
  b: LangStringSet | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  // Sort by language for consistent comparison
  const sortedA = [...a].sort((x, y) => x.language.localeCompare(y.language));
  const sortedB = [...b].sort((x, y) => x.language.localeCompare(y.language));

  return sortedA.every(
    (langStr, i) =>
      langStr.language === sortedB[i].language && langStr.text === sortedB[i].text
  );
}

/**
 * Calculate diff between two AAS Environments
 *
 * Uses AAS-aware matching:
 * - Submodels matched by id, then semanticId
 * - SubmodelElements matched by idShort within their parent
 *
 * @param before - The original environment
 * @param after - The modified environment
 * @returns Diff result with all changes
 *
 * @example
 * ```ts
 * const diff = calculateDiff(originalEnv, modifiedEnv);
 * console.log(`${diff.changeCount} changes found`);
 * ```
 */
export function calculateDiff(before: Environment, after: Environment): DiffResult {
  const entries: DiffEntry[] = [];

  // Diff submodels
  diffSubmodels(before.submodels || [], after.submodels || [], entries);

  // Diff AAS entries
  diffAasEntries(
    before.assetAdministrationShells || [],
    after.assetAdministrationShells || [],
    entries
  );

  // Diff concept descriptions
  diffConceptDescriptions(
    before.conceptDescriptions || [],
    after.conceptDescriptions || [],
    entries
  );

  // Calculate summary
  const additions = entries.filter((e) => e.type === 'added').length;
  const removals = entries.filter((e) => e.type === 'removed').length;
  const modifications = entries.filter((e) => e.type === 'modified').length;

  return {
    changeCount: additions + removals + modifications,
    additions,
    removals,
    modifications,
    entries,
    identical: entries.length === 0,
  };
}

function diffSubmodels(
  before: Submodel[],
  after: Submodel[],
  entries: DiffEntry[]
): void {
  // Match submodels by id with index maps for O(1) lookup
  const beforeById = new Map(before.map((sm) => [sm.id, sm]));
  const afterById = new Map(after.map((sm) => [sm.id, sm]));

  // Create index maps upfront to avoid O(n) indexOf calls in loops
  const beforeIndexById = new Map(before.map((sm, idx) => [sm.id, idx]));
  const afterIndexById = new Map(after.map((sm, idx) => [sm.id, idx]));

  // Find removed submodels
  for (const [id, sm] of beforeById) {
    if (!afterById.has(id)) {
      entries.push({
        type: 'removed',
        beforePath: `/submodels/${beforeIndexById.get(id)}`,
        idShort: sm.idShort,
        semanticId: sm.semanticId?.keys?.[0]?.value,
        description: `Submodel "${sm.idShort || sm.id}" removed`,
      });
    }
  }

  // Find added submodels
  for (const [id, sm] of afterById) {
    if (!beforeById.has(id)) {
      entries.push({
        type: 'added',
        afterPath: `/submodels/${afterIndexById.get(id)}`,
        idShort: sm.idShort,
        semanticId: sm.semanticId?.keys?.[0]?.value,
        description: `Submodel "${sm.idShort || sm.id}" added`,
      });
    }
  }

  // Diff matching submodels
  for (const [id, beforeSm] of beforeById) {
    const afterSm = afterById.get(id);
    if (afterSm) {
      const beforeIndex = beforeIndexById.get(id)!;
      const afterIndex = afterIndexById.get(id)!;
      diffSubmodelElements(
        beforeSm.submodelElements || [],
        afterSm.submodelElements || [],
        `/submodels/${beforeIndex}/submodelElements`,
        `/submodels/${afterIndex}/submodelElements`,
        entries
      );
    }
  }
}

function diffSubmodelElements(
  before: SubmodelElement[],
  after: SubmodelElement[],
  beforeBasePath: string,
  afterBasePath: string,
  entries: DiffEntry[]
): void {
  // Match by idShort with index maps for O(1) lookup
  const beforeByIdShort = new Map(before.map((sme) => [sme.idShort, sme]));
  const afterByIdShort = new Map(after.map((sme) => [sme.idShort, sme]));

  // Create index maps upfront to avoid O(n) indexOf calls in loops
  const beforeIndexByIdShort = new Map(before.map((sme, idx) => [sme.idShort, idx]));
  const afterIndexByIdShort = new Map(after.map((sme, idx) => [sme.idShort, idx]));

  // Find removed elements
  for (const [idShort] of beforeByIdShort) {
    if (idShort && !afterByIdShort.has(idShort)) {
      entries.push({
        type: 'removed',
        beforePath: `${beforeBasePath}/${beforeIndexByIdShort.get(idShort)}`,
        idShort,
        description: `Element "${idShort}" removed`,
      });
    }
  }

  // Find added elements
  for (const [idShort] of afterByIdShort) {
    if (idShort && !beforeByIdShort.has(idShort)) {
      entries.push({
        type: 'added',
        afterPath: `${afterBasePath}/${afterIndexByIdShort.get(idShort)}`,
        idShort,
        description: `Element "${idShort}" added`,
      });
    }
  }

  // Diff matching elements
  for (const [idShort, beforeSme] of beforeByIdShort) {
    if (!idShort) continue;
    const afterSme = afterByIdShort.get(idShort);
    if (afterSme) {
      diffSingleElement(
        beforeSme,
        afterSme,
        `${beforeBasePath}/${beforeIndexByIdShort.get(idShort)}`,
        `${afterBasePath}/${afterIndexByIdShort.get(idShort)}`,
        entries
      );
    }
  }
}

function diffSingleElement(
  before: SubmodelElement,
  after: SubmodelElement,
  beforePath: string,
  afterPath: string,
  entries: DiffEntry[]
): void {
  // If model types differ, report as modification
  if (before.modelType !== after.modelType) {
    entries.push({
      type: 'modified',
      beforePath,
      afterPath,
      idShort: before.idShort,
      beforeValue: before.modelType,
      afterValue: after.modelType,
      description: `Element "${before.idShort}" modelType changed from ${before.modelType} to ${after.modelType}`,
    });
    return;
  }

  // Compare Property values
  if (before.modelType === 'Property' && after.modelType === 'Property') {
    const beforeProp = before as { value?: string; valueType?: string };
    const afterProp = after as { value?: string; valueType?: string };

    if (beforeProp.value !== afterProp.value) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/value`,
        afterPath: `${afterPath}/value`,
        idShort: before.idShort,
        beforeValue: beforeProp.value,
        afterValue: afterProp.value,
        description: `Property "${before.idShort}" value changed`,
      });
    }

    if (beforeProp.valueType !== afterProp.valueType) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/valueType`,
        afterPath: `${afterPath}/valueType`,
        idShort: before.idShort,
        beforeValue: beforeProp.valueType,
        afterValue: afterProp.valueType,
        description: `Property "${before.idShort}" valueType changed`,
      });
    }
  }

  // Compare MultiLanguageProperty values
  if (
    before.modelType === 'MultiLanguageProperty' &&
    after.modelType === 'MultiLanguageProperty'
  ) {
    const beforeMlp = before as { value?: LangStringSet };
    const afterMlp = after as { value?: LangStringSet };

    if (!langStringSetsEqual(beforeMlp.value, afterMlp.value)) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/value`,
        afterPath: `${afterPath}/value`,
        idShort: before.idShort,
        beforeValue: beforeMlp.value,
        afterValue: afterMlp.value,
        description: `MultiLanguageProperty "${before.idShort}" value changed`,
      });
    }
  }

  // Compare Range values
  if (before.modelType === 'Range' && after.modelType === 'Range') {
    const beforeRange = before as { min?: string; max?: string; valueType?: string };
    const afterRange = after as { min?: string; max?: string; valueType?: string };

    if (beforeRange.min !== afterRange.min) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/min`,
        afterPath: `${afterPath}/min`,
        idShort: before.idShort,
        beforeValue: beforeRange.min,
        afterValue: afterRange.min,
        description: `Range "${before.idShort}" min changed`,
      });
    }

    if (beforeRange.max !== afterRange.max) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/max`,
        afterPath: `${afterPath}/max`,
        idShort: before.idShort,
        beforeValue: beforeRange.max,
        afterValue: afterRange.max,
        description: `Range "${before.idShort}" max changed`,
      });
    }

    if (beforeRange.valueType !== afterRange.valueType) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/valueType`,
        afterPath: `${afterPath}/valueType`,
        idShort: before.idShort,
        beforeValue: beforeRange.valueType,
        afterValue: afterRange.valueType,
        description: `Range "${before.idShort}" valueType changed`,
      });
    }
  }

  // Compare File values
  if (before.modelType === 'File' && after.modelType === 'File') {
    const beforeFile = before as { value?: string; contentType?: string };
    const afterFile = after as { value?: string; contentType?: string };

    if (beforeFile.value !== afterFile.value) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/value`,
        afterPath: `${afterPath}/value`,
        idShort: before.idShort,
        beforeValue: beforeFile.value,
        afterValue: afterFile.value,
        description: `File "${before.idShort}" value changed`,
      });
    }

    if (beforeFile.contentType !== afterFile.contentType) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/contentType`,
        afterPath: `${afterPath}/contentType`,
        idShort: before.idShort,
        beforeValue: beforeFile.contentType,
        afterValue: afterFile.contentType,
        description: `File "${before.idShort}" contentType changed`,
      });
    }
  }

  // Compare Blob values
  if (before.modelType === 'Blob' && after.modelType === 'Blob') {
    const beforeBlob = before as { value?: string; contentType?: string };
    const afterBlob = after as { value?: string; contentType?: string };

    if (beforeBlob.value !== afterBlob.value) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/value`,
        afterPath: `${afterPath}/value`,
        idShort: before.idShort,
        beforeValue: beforeBlob.value ? '[base64 data]' : undefined,
        afterValue: afterBlob.value ? '[base64 data]' : undefined,
        description: `Blob "${before.idShort}" value changed`,
      });
    }

    if (beforeBlob.contentType !== afterBlob.contentType) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/contentType`,
        afterPath: `${afterPath}/contentType`,
        idShort: before.idShort,
        beforeValue: beforeBlob.contentType,
        afterValue: afterBlob.contentType,
        description: `Blob "${before.idShort}" contentType changed`,
      });
    }
  }

  // Compare ReferenceElement values
  if (before.modelType === 'ReferenceElement' && after.modelType === 'ReferenceElement') {
    const beforeRef = before as { value?: Reference };
    const afterRef = after as { value?: Reference };

    if (!referencesEqual(beforeRef.value, afterRef.value)) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/value`,
        afterPath: `${afterPath}/value`,
        idShort: before.idShort,
        beforeValue: beforeRef.value,
        afterValue: afterRef.value,
        description: `ReferenceElement "${before.idShort}" value changed`,
      });
    }
  }

  // Recursively diff SubmodelElementCollections
  if (
    before.modelType === 'SubmodelElementCollection' &&
    after.modelType === 'SubmodelElementCollection'
  ) {
    const beforeColl = before as { value?: SubmodelElement[] };
    const afterColl = after as { value?: SubmodelElement[] };

    diffSubmodelElements(
      beforeColl.value || [],
      afterColl.value || [],
      `${beforePath}/value`,
      `${afterPath}/value`,
      entries
    );
  }
}

function diffAasEntries(
  before: AssetAdministrationShell[],
  after: AssetAdministrationShell[],
  entries: DiffEntry[]
): void {
  const beforeById = new Map(before.map((aas) => [aas.id, aas]));
  const afterById = new Map(after.map((aas) => [aas.id, aas]));

  // Create index maps upfront to avoid O(n) indexOf calls in loops
  const beforeIndexById = new Map(before.map((aas, idx) => [aas.id, idx]));
  const afterIndexById = new Map(after.map((aas, idx) => [aas.id, idx]));

  // Find removed AAS
  for (const [id, aas] of beforeById) {
    if (!afterById.has(id)) {
      entries.push({
        type: 'removed',
        beforePath: `/assetAdministrationShells/${beforeIndexById.get(id)}`,
        idShort: aas.idShort,
        description: `AAS "${aas.idShort || aas.id}" removed`,
      });
    }
  }

  // Find added AAS
  for (const [id, aas] of afterById) {
    if (!beforeById.has(id)) {
      entries.push({
        type: 'added',
        afterPath: `/assetAdministrationShells/${afterIndexById.get(id)}`,
        idShort: aas.idShort,
        description: `AAS "${aas.idShort || aas.id}" added`,
      });
    }
  }

  // Diff matching AAS
  for (const [id, beforeAas] of beforeById) {
    const afterAas = afterById.get(id);
    if (afterAas) {
      const beforeIndex = beforeIndexById.get(id)!;
      const afterIndex = afterIndexById.get(id)!;
      diffSingleAas(beforeAas, afterAas, beforeIndex, afterIndex, entries);
    }
  }
}

function diffSingleAas(
  before: AssetAdministrationShell,
  after: AssetAdministrationShell,
  beforeIndex: number,
  afterIndex: number,
  entries: DiffEntry[]
): void {
  const beforePath = `/assetAdministrationShells/${beforeIndex}`;
  const afterPath = `/assetAdministrationShells/${afterIndex}`;

  // Compare globalAssetId
  if (before.assetInformation.globalAssetId !== after.assetInformation.globalAssetId) {
    entries.push({
      type: 'modified',
      beforePath: `${beforePath}/assetInformation/globalAssetId`,
      afterPath: `${afterPath}/assetInformation/globalAssetId`,
      idShort: before.idShort,
      beforeValue: before.assetInformation.globalAssetId,
      afterValue: after.assetInformation.globalAssetId,
      description: `AAS "${before.idShort || before.id}" globalAssetId changed`,
    });
  }

  // Compare assetKind
  if (before.assetInformation.assetKind !== after.assetInformation.assetKind) {
    entries.push({
      type: 'modified',
      beforePath: `${beforePath}/assetInformation/assetKind`,
      afterPath: `${afterPath}/assetInformation/assetKind`,
      idShort: before.idShort,
      beforeValue: before.assetInformation.assetKind,
      afterValue: after.assetInformation.assetKind,
      description: `AAS "${before.idShort || before.id}" assetKind changed`,
    });
  }

  // Compare derivedFrom reference
  if (!referencesEqual(before.derivedFrom, after.derivedFrom)) {
    entries.push({
      type: 'modified',
      beforePath: `${beforePath}/derivedFrom`,
      afterPath: `${afterPath}/derivedFrom`,
      idShort: before.idShort,
      beforeValue: before.derivedFrom,
      afterValue: after.derivedFrom,
      description: `AAS "${before.idShort || before.id}" derivedFrom changed`,
    });
  }

  // Compare submodel references using Sets for O(1) lookups
  const beforeSubmodelIds = (before.submodels || []).map(
    (ref) => ref.keys[0]?.value
  );
  const afterSubmodelIds = (after.submodels || []).map(
    (ref) => ref.keys[0]?.value
  );

  const afterSubmodelIdSet = new Set(afterSubmodelIds);
  const beforeSubmodelIdSet = new Set(beforeSubmodelIds);

  const removedRefs = beforeSubmodelIds.filter((id) => !afterSubmodelIdSet.has(id));
  const addedRefs = afterSubmodelIds.filter((id) => !beforeSubmodelIdSet.has(id));

  for (const refId of removedRefs) {
    entries.push({
      type: 'removed',
      beforePath: `${beforePath}/submodels`,
      idShort: before.idShort,
      beforeValue: refId,
      description: `AAS "${before.idShort || before.id}" submodel reference to "${refId}" removed`,
    });
  }

  for (const refId of addedRefs) {
    entries.push({
      type: 'added',
      afterPath: `${afterPath}/submodels`,
      idShort: after.idShort,
      afterValue: refId,
      description: `AAS "${after.idShort || after.id}" submodel reference to "${refId}" added`,
    });
  }
}

function diffConceptDescriptions(
  before: ConceptDescription[],
  after: ConceptDescription[],
  entries: DiffEntry[]
): void {
  const beforeById = new Map(before.map((cd) => [cd.id, cd]));
  const afterById = new Map(after.map((cd) => [cd.id, cd]));

  // Create index maps upfront to avoid O(n) indexOf calls in loops
  const beforeIndexById = new Map(before.map((cd, idx) => [cd.id, idx]));
  const afterIndexById = new Map(after.map((cd, idx) => [cd.id, idx]));

  // Find removed ConceptDescriptions
  for (const [id, cd] of beforeById) {
    if (!afterById.has(id)) {
      entries.push({
        type: 'removed',
        beforePath: `/conceptDescriptions/${beforeIndexById.get(id)}`,
        idShort: cd.idShort,
        description: `ConceptDescription "${cd.idShort || cd.id}" removed`,
      });
    }
  }

  // Find added ConceptDescriptions
  for (const [id, cd] of afterById) {
    if (!beforeById.has(id)) {
      entries.push({
        type: 'added',
        afterPath: `/conceptDescriptions/${afterIndexById.get(id)}`,
        idShort: cd.idShort,
        description: `ConceptDescription "${cd.idShort || cd.id}" added`,
      });
    }
  }

  // Diff matching ConceptDescriptions
  for (const [id, beforeCd] of beforeById) {
    const afterCd = afterById.get(id);
    if (afterCd) {
      const beforeIndex = beforeIndexById.get(id)!;
      const afterIndex = afterIndexById.get(id)!;
      diffSingleConceptDescription(beforeCd, afterCd, beforeIndex, afterIndex, entries);
    }
  }
}

function diffSingleConceptDescription(
  before: ConceptDescription,
  after: ConceptDescription,
  beforeIndex: number,
  afterIndex: number,
  entries: DiffEntry[]
): void {
  const beforePath = `/conceptDescriptions/${beforeIndex}`;
  const afterPath = `/conceptDescriptions/${afterIndex}`;

  // Compare isCaseOf references
  const beforeIsCaseOf = before.isCaseOf || [];
  const afterIsCaseOf = after.isCaseOf || [];

  if (beforeIsCaseOf.length !== afterIsCaseOf.length) {
    entries.push({
      type: 'modified',
      beforePath: `${beforePath}/isCaseOf`,
      afterPath: `${afterPath}/isCaseOf`,
      idShort: before.idShort,
      beforeValue: beforeIsCaseOf,
      afterValue: afterIsCaseOf,
      description: `ConceptDescription "${before.idShort || before.id}" isCaseOf changed`,
    });
  } else {
    // Check if any isCaseOf reference changed
    const changed = beforeIsCaseOf.some(
      (ref, i) => !referencesEqual(ref, afterIsCaseOf[i])
    );
    if (changed) {
      entries.push({
        type: 'modified',
        beforePath: `${beforePath}/isCaseOf`,
        afterPath: `${afterPath}/isCaseOf`,
        idShort: before.idShort,
        beforeValue: beforeIsCaseOf,
        afterValue: afterIsCaseOf,
        description: `ConceptDescription "${before.idShort || before.id}" isCaseOf changed`,
      });
    }
  }

  // Compare embeddedDataSpecifications (simplified - just check count and basic structure)
  const beforeSpecs = before.embeddedDataSpecifications || [];
  const afterSpecs = after.embeddedDataSpecifications || [];

  if (beforeSpecs.length !== afterSpecs.length) {
    entries.push({
      type: 'modified',
      beforePath: `${beforePath}/embeddedDataSpecifications`,
      afterPath: `${afterPath}/embeddedDataSpecifications`,
      idShort: before.idShort,
      description: `ConceptDescription "${before.idShort || before.id}" embeddedDataSpecifications count changed`,
    });
  } else {
    // Check each spec for changes in preferredName or definition
    for (let i = 0; i < beforeSpecs.length; i++) {
      const beforeSpec = beforeSpecs[i];
      const afterSpec = afterSpecs[i];

      const beforeContent = beforeSpec.dataSpecificationContent;
      const afterContent = afterSpec.dataSpecificationContent;

      if (!langStringSetsEqual(beforeContent.preferredName, afterContent.preferredName)) {
        entries.push({
          type: 'modified',
          beforePath: `${beforePath}/embeddedDataSpecifications/${i}/dataSpecificationContent/preferredName`,
          afterPath: `${afterPath}/embeddedDataSpecifications/${i}/dataSpecificationContent/preferredName`,
          idShort: before.idShort,
          beforeValue: beforeContent.preferredName,
          afterValue: afterContent.preferredName,
          description: `ConceptDescription "${before.idShort || before.id}" preferredName changed`,
        });
      }

      if (!langStringSetsEqual(beforeContent.definition, afterContent.definition)) {
        entries.push({
          type: 'modified',
          beforePath: `${beforePath}/embeddedDataSpecifications/${i}/dataSpecificationContent/definition`,
          afterPath: `${afterPath}/embeddedDataSpecifications/${i}/dataSpecificationContent/definition`,
          idShort: before.idShort,
          beforeValue: beforeContent.definition,
          afterValue: afterContent.definition,
          description: `ConceptDescription "${before.idShort || before.id}" definition changed`,
        });
      }

      if (beforeContent.unit !== afterContent.unit) {
        entries.push({
          type: 'modified',
          beforePath: `${beforePath}/embeddedDataSpecifications/${i}/dataSpecificationContent/unit`,
          afterPath: `${afterPath}/embeddedDataSpecifications/${i}/dataSpecificationContent/unit`,
          idShort: before.idShort,
          beforeValue: beforeContent.unit,
          afterValue: afterContent.unit,
          description: `ConceptDescription "${before.idShort || before.id}" unit changed`,
        });
      }
    }
  }
}
