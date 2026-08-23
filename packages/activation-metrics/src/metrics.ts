import {
  parseActivationContractId,
  type ActivationContractId,
  type OpaqueId,
} from "./brands.js";
import { getMetricSpec } from "./catalog.js";
import type { MetricResult, ObservationRecord } from "./types.js";

function matchedObservation(
  observations: readonly ObservationRecord[],
  contractId: ActivationContractId,
): ObservationRecord | undefined {
  return observations.find(
    (observation) =>
      observation.contractId === contractId && observation.status === "matched",
  );
}

export function metricDuration(args: {
  sessionId: OpaqueId;
  from: ActivationContractId;
  to: ActivationContractId;
  observations: readonly ObservationRecord[];
  metricId?: string;
}): MetricResult {
  const from = parseActivationContractId(args.from);
  const to = parseActivationContractId(args.to);
  const metricId = args.metricId ?? `${from}_to_${to}`;

  const scoped = args.observations.filter(
    (observation) => observation.sessionId === args.sessionId,
  );
  const fromObs = matchedObservation(scoped, from);
  if (fromObs === undefined) {
    return { kind: "unavailable", metricId, reason: "missing_from" };
  }
  const toObs = matchedObservation(scoped, to);
  if (toObs === undefined) {
    const anyTo = scoped.find((observation) => observation.contractId === to);
    if (anyTo?.status === "not_ready") {
      return { kind: "unavailable", metricId, reason: "not_ready_slot" };
    }
    if (anyTo !== undefined && anyTo.status !== "matched") {
      return { kind: "unavailable", metricId, reason: "not_matched" };
    }
    return { kind: "unavailable", metricId, reason: "missing_to" };
  }
  return {
    kind: "duration",
    metricId,
    from,
    to,
    durationMicros: toObs.observedAtMicros - fromObs.observedAtMicros,
    fromEventId: fromObs.eventId,
    toEventId: toObs.eventId,
  };
}

export function metricConversion(args: {
  from: ActivationContractId;
  to: ActivationContractId;
  observations: readonly ObservationRecord[];
  metricId?: string;
}): MetricResult {
  const from = parseActivationContractId(args.from);
  const to = parseActivationContractId(args.to);
  const metricId = args.metricId ?? `${from}_to_${to}`;

  const sessionsWithFrom = new Set<string>();
  const sessionsWithBoth = new Set<string>();

  for (const observation of args.observations) {
    if (observation.contractId === from && observation.status === "matched") {
      sessionsWithFrom.add(observation.sessionId);
    }
  }
  for (const observation of args.observations) {
    if (
      observation.contractId === to &&
      observation.status === "matched" &&
      sessionsWithFrom.has(observation.sessionId)
    ) {
      sessionsWithBoth.add(observation.sessionId);
    }
  }

  return {
    kind: "conversion",
    metricId,
    from,
    to,
    matchedFrom: sessionsWithFrom.size,
    matchedToGivenFrom: sessionsWithBoth.size,
  };
}

export function metricBySpec(
  metricId: string,
  observations: readonly ObservationRecord[],
  sessionId?: OpaqueId,
): MetricResult {
  const spec = getMetricSpec(metricId);
  if (spec === undefined) {
    throw new Error(`unknown MetricSpec: ${metricId}`);
  }
  if (spec.aggregation === "duration") {
    if (sessionId === undefined) {
      throw new Error(`duration metric ${metricId} requires sessionId`);
    }
    return metricDuration({
      sessionId,
      from: spec.from,
      to: spec.to,
      observations,
      metricId: spec.metricId,
    });
  }
  return metricConversion({
    from: spec.from,
    to: spec.to,
    observations,
    metricId: spec.metricId,
  });
}
