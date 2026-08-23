import { createHash } from "node:crypto";
import { assertNoSecretFields } from "../../pack/src/index.js";
import { collectDeclaredActionIds } from "./derive.js";
import type {
  KitchenCandidate,
  ValidateReport,
  WorkingSetSnapshot,
} from "./types.js";

const TENANT_RECORD_KEY_FRAGMENTS = [
  "semanticClaim",
  "semantic_claim",
  "employeeId",
  "employee_id",
  "payroll",
  "conversationId",
  "transcript",
  "oauthToken",
  "sourceRow",
  "claimPayload",
] as const;

export function validateCandidate(
  candidate: KitchenCandidate,
  options?: {
    readonly snapshot?: WorkingSetSnapshot;
    readonly surfaceDigests?: readonly string[];
  },
): ValidateReport {
  const secretFindings: string[] = [];
  try {
    assertNoSecretFields(JSON.parse(candidate.compiled.canonicalJson));
    for (const dependency of candidate.authority.ontology) {
      assertNoSecretFields(JSON.parse(dependency.canonicalJson));
    }
  } catch (error) {
    secretFindings.push(error instanceof Error ? error.message : String(error));
  }

  const tenantFindings = scanTenantRecords(candidate);
  const pinFindings: string[] = [];
  for (const dependency of candidate.authority.ontology) {
    const actual = createHash("sha256")
      .update(dependency.canonicalJson)
      .digest("hex");
    if (actual !== dependency.digest) {
      pinFindings.push(
        `${dependency.definitionId}: digest ${dependency.digest} != sha256 ${actual}`,
      );
    }
  }

  const capabilityFindings: string[] = [];
  if (options?.snapshot !== undefined) {
    const declared = collectDeclaredActionIds(options.snapshot);
    for (const capability of candidate.authority.capabilities) {
      for (const actionId of capability.degrade?.actionIds ?? []) {
        if (!declared.has(actionId) && !actionId.includes(".")) {
          capabilityFindings.push(
            `capability ${capability.id} degrade action unknown: ${actionId}`,
          );
        }
      }
    }
  }

  const firstSuccessFindings: string[] = [];
  const outcome = candidate.authority.firstSuccess.outcome;
  if (outcome.kind === "action_committed") {
    const present = candidate.authority.ontology.some((dependency) => {
      const document = JSON.parse(dependency.canonicalJson) as {
        actions?: Array<{ id: string }>;
      };
      return (document.actions ?? []).some(
        (action) => action.id === outcome.actionId,
      );
    });
    if (!present) {
      firstSuccessFindings.push(
        `firstSuccess action missing from ontology: ${outcome.actionId}`,
      );
    }
  }

  const surfaceFindings: string[] = [];
  for (const surfaceDigest of options?.surfaceDigests ?? []) {
    if (surfaceDigest.length !== 64) {
      surfaceFindings.push(`invalid surface digest ${surfaceDigest}`);
    }
  }

  const mutableFindings: string[] = [];
  if (
    candidate.authority.version === "latest" ||
    candidate.authority.version.length === 0
  ) {
    mutableFindings.push(`mutable version ${candidate.authority.version}`);
  }
  for (const dependency of candidate.authority.ontology) {
    if (dependency.digest === "latest") {
      mutableFindings.push(`mutable digest for ${dependency.definitionId}`);
    }
  }

  const copyFindings: string[] = [];
  if (candidate.copy !== null) {
    if (candidate.copy.forAuthorityDigest !== candidate.compiled.digest) {
      copyFindings.push("copy digest pin mismatch");
    }
    const smuggled = candidate.copy as unknown as Record<string, unknown>;
    for (const key of [
      "integrationRequirements",
      "ontologyDependencies",
      "capabilities",
      "firstSuccessContract",
    ]) {
      if (key in smuggled) {
        copyFindings.push(`copy smuggles ${key}`);
      }
    }
  }

  const secretScan = {
    ok: secretFindings.length === 0,
    findings: secretFindings,
  };
  const tenantRecordScan = {
    ok: tenantFindings.length === 0,
    findings: tenantFindings,
  };
  const dependencyPins = { ok: pinFindings.length === 0, findings: pinFindings };
  const capabilityCoverage = {
    ok: capabilityFindings.length === 0,
    findings: capabilityFindings,
  };
  const firstSuccess = {
    ok: firstSuccessFindings.length === 0,
    findings: firstSuccessFindings,
  };
  const surfaceBindings = {
    ok: surfaceFindings.length === 0,
    findings: surfaceFindings,
  };
  const mutableVersion = {
    ok: mutableFindings.length === 0,
    findings: mutableFindings,
  };
  const copyAuthoritySealed = {
    ok: copyFindings.length === 0,
    findings: copyFindings,
  };
  const report: ValidateReport = {
    secretScan,
    tenantRecordScan,
    dependencyPins,
    capabilityCoverage,
    firstSuccess,
    surfaceBindings,
    mutableVersion,
    copyAuthoritySealed,
    ok:
      secretScan.ok &&
      tenantRecordScan.ok &&
      dependencyPins.ok &&
      capabilityCoverage.ok &&
      firstSuccess.ok &&
      surfaceBindings.ok &&
      mutableVersion.ok &&
      copyAuthoritySealed.ok,
  };
  return report;
}

function scanTenantRecords(candidate: KitchenCandidate): string[] {
  const findings: string[] = [];
  const payloads = [
    candidate.compiled.canonicalJson,
    ...candidate.authority.ontology.map((dependency) => dependency.canonicalJson),
  ];
  for (const payload of payloads) {
    findings.push(...collectTenantRecordKeys(JSON.parse(payload), ""));
  }
  if (candidate.extractionTrace.sourceTenantId.includes("claim:")) {
    findings.push("extractionTrace embeds claim-shaped tenant id");
  }
  return findings;
}

function collectTenantRecordKeys(value: unknown, pathPrefix: string): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectTenantRecordKeys(child, `${pathPrefix}${index}.`),
    );
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (
      TENANT_RECORD_KEY_FRAGMENTS.some((fragment) =>
        key.toLowerCase().includes(fragment.toLowerCase()),
      )
    ) {
      found.push(`${pathPrefix}${key}`);
    }
    found.push(...collectTenantRecordKeys(child, `${pathPrefix}${key}.`));
  }
  return found;
}

/** Fail closed when signing identity does not match authority publisher. */
export function assertPublisherIdentity(input: {
  readonly authorityPublisherId: string;
  readonly signingPublisherId: string;
}): void {
  if (input.authorityPublisherId !== input.signingPublisherId) {
    throw new Error(
      `publisher identity mismatch: authority=${input.authorityPublisherId} signing=${input.signingPublisherId}`,
    );
  }
}
