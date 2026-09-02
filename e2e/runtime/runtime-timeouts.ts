const secondMilliseconds = 1_000;

export const cleanupClaimPollIntervalMilliseconds = 250;
export const cleanupClaimPollAttempts = 480;
export const cleanupClaimWaitMilliseconds =
  cleanupClaimPollIntervalMilliseconds * cleanupClaimPollAttempts;

export const processGroupPollIntervalMilliseconds = 100;
export const processGroupTerminationAttemptsPerSignal = 50;
const processGroupTerminationSignalCount = 2;
export const processGroupTerminationMaximumMilliseconds =
  processGroupPollIntervalMilliseconds *
  processGroupTerminationAttemptsPerSignal *
  processGroupTerminationSignalCount;

export const dockerOwnershipInspectionCount = 3;
export const dockerOwnershipInspectionTimeoutMilliseconds =
  15 * secondMilliseconds;
export const composeCleanupTimeoutMilliseconds = 60 * secondMilliseconds;
export const cleanupFilesystemAllowanceMilliseconds = 30 * secondMilliseconds;

export const ownedCleanupBudgetMilliseconds =
  cleanupClaimWaitMilliseconds +
  processGroupTerminationMaximumMilliseconds +
  dockerOwnershipInspectionCount *
    dockerOwnershipInspectionTimeoutMilliseconds +
  composeCleanupTimeoutMilliseconds +
  cleanupFilesystemAllowanceMilliseconds;

export const cleanupRecoveryAdmissionWindowMilliseconds =
  120 * secondMilliseconds;

export const bootstrapCleanupAuthorityBoundMilliseconds =
  450 * secondMilliseconds;
const runtimeCommandHeadroomMilliseconds = 30 * secondMilliseconds;
const runtimeCommandInnerBoundMilliseconds = Math.max(
  bootstrapCleanupAuthorityBoundMilliseconds,
  ownedCleanupBudgetMilliseconds,
);
export const runtimeCommandTimeoutMilliseconds =
  runtimeCommandInnerBoundMilliseconds + runtimeCommandHeadroomMilliseconds;

const cancellationBoundedAttemptCount = 2;
const cancellationFinalizationHeadroomMilliseconds = 60 * secondMilliseconds;
export const cancellationConvergenceMilliseconds =
  runtimeCommandTimeoutMilliseconds * cancellationBoundedAttemptCount +
  cancellationFinalizationHeadroomMilliseconds;

export const proofCommandTimeoutMilliseconds =
  runtimeCommandTimeoutMilliseconds;
const proofFinalizationHeadroomMilliseconds = 30 * secondMilliseconds;
export const proofGracefulTerminationMilliseconds =
  cancellationConvergenceMilliseconds +
  runtimeCommandTimeoutMilliseconds +
  proofFinalizationHeadroomMilliseconds;

export const releaseProofBarrierPollIntervalMilliseconds = 100;
export const releaseProofBarrierPollAttempts = 6_000;
