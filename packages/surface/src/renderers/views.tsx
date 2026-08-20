import type { FormEvent } from "react";
import type {
  ActionOperationView,
  EffectStatusView,
  QueryBindingView,
  SurfaceExactValue,
} from "../model.js";
import { useSurfaceInteraction } from "./interaction.js";

export function QueryTableView(props: {
  readonly bindingIds: readonly string[];
  readonly label: string;
}) {
  const { data } = useSurfaceInteraction();
  return (
    <div className="surface-table-wrap">
      <table aria-label={props.label}>
        <thead>
          <tr>
            <th scope="col">Binding</th>
            <th scope="col">Values</th>
            <th scope="col">Commit sequence</th>
          </tr>
        </thead>
        <tbody>
          {props.bindingIds.map((bindingId) => {
            const result = data.queries[bindingId];
            return (
              <tr key={bindingId}>
                <th scope="row">{bindingLabel(bindingId)}</th>
                <td>{queryValues(result)}</td>
                <td>{result?.actualCommitSequence ?? "Loading"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RelationView(props: {
  readonly bindingId: string;
  readonly label: string;
  readonly mode: "list" | "value";
}) {
  const { data } = useSurfaceInteraction();
  const result = data.queries[props.bindingId];
  if (props.mode === "value") {
    return (
      <div className="relation-value">
        <h4>{props.label}</h4>
        <p>{queryValues(result)}</p>
      </div>
    );
  }
  return (
    <div className="relation-list">
      <h4>{props.label}</h4>
      <ul>
        {(result?.values ?? []).map((value, index) => (
          <li key={`${props.bindingId}.${index}`}>
            {exactValueText(value.value)}
          </li>
        ))}
        {result?.values.length === 0 ? <li>No values</li> : null}
      </ul>
    </div>
  );
}

export function ActionFormView(props: {
  readonly bindingId: string;
  readonly instanceId: string;
  readonly label: string;
}) {
  const interaction = useSurfaceInteraction();
  const binding = interaction.document.actionBindings.find(
    (candidate) => candidate.id === props.bindingId,
  );
  if (binding === undefined) {
    throw new Error(`Unknown Action binding ${props.bindingId}`);
  }
  const operation =
    interaction.data.actions[binding.id] ??
    ({ kind: "idle" } satisfies ActionOperationView);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (operation.kind === "proposed") {
      void interaction.commit(binding.id);
      return;
    }
    if (operation.kind === "committing" || operation.kind === "recovering") {
      return;
    }
    void interaction.propose(binding.id);
  };

  return (
    <form className="action-form" onSubmit={submit}>
      <fieldset disabled={isBusy(operation)}>
        <legend>{props.label}</legend>
        {binding.inputs.map((input) => {
          const value = interaction.fieldValue(
            binding.id,
            input.inputId,
          );
          const inputId = `${props.instanceId}.${binding.id}.${input.inputId}`;
          if (input.valueType.kind === "bool") {
            return (
              <label className="field checkbox" htmlFor={inputId} key={inputId}>
                <input
                  checked={value === true}
                  id={inputId}
                  name={input.inputId}
                  onChange={(event) =>
                    interaction.setFieldValue(
                      binding.id,
                      input.inputId,
                      event.currentTarget.checked,
                    )
                  }
                  type="checkbox"
                />
                {input.label}
              </label>
            );
          }
          const numeric =
            input.valueType.kind === "decimal" ||
            input.valueType.kind === "integer" ||
            input.valueType.kind === "quantity";
          return (
            <label className="field" htmlFor={inputId} key={inputId}>
              <span>{input.label}</span>
              <span className="input-with-unit">
                <input
                  id={inputId}
                  inputMode={numeric ? "decimal" : undefined}
                  name={input.inputId}
                  onChange={(event) =>
                    interaction.setFieldValue(
                      binding.id,
                      input.inputId,
                      event.currentTarget.value,
                    )
                  }
                  required
                  step={input.valueType.kind === "integer" ? "1" : undefined}
                  type={numeric ? "number" : "text"}
                  value={typeof value === "string" ? value : ""}
                />
                {input.valueType.kind === "quantity" ? (
                  <span>{input.valueType.unit}</span>
                ) : null}
              </span>
            </label>
          );
        })}
        <button type="submit">
          {operation.kind === "proposed" ? "Commit Action" : "Propose Action"}
        </button>
      </fieldset>
      <OperationStatusView operation={operation} />
    </form>
  );
}

export function OperationStatusView(props: {
  readonly operation: ActionOperationView;
}) {
  const status = operationText(props.operation);
  const failure =
    props.operation.kind === "denied" ||
    props.operation.kind === "failed" ||
    props.operation.kind === "stale" ||
    props.operation.kind === "unavailable";
  return (
    <p
      className={`operation-status status-${props.operation.kind}`}
      role={failure ? "alert" : "status"}
    >
      {status}
    </p>
  );
}

export function EffectStatusViewList(props: {
  readonly bindingId: string;
}) {
  const { data } = useSurfaceInteraction();
  const operation = data.actions[props.bindingId];
  if (operation?.kind !== "committed") {
    return <p className="effect-status">No committed effect.</p>;
  }
  if (operation.effects.length === 0) {
    return <p className="effect-status">Committed. No external effect.</p>;
  }
  return (
    <ul className="effect-list" aria-label="External effect status">
      {operation.effects.map((effect) => (
        <li key={effect.effectRequestId}>{effectText(effect)}</li>
      ))}
    </ul>
  );
}

export function HistoryView(props: { readonly bindingId: string }) {
  const { data } = useSurfaceInteraction();
  const entries = data.history[props.bindingId] ?? [];
  return (
    <ol className="timeline" aria-label="Action history">
      {entries.map((entry) => (
        <li key={`${entry.sequence}.${entry.label}`}>
          <span>{entry.label}</span>
          <small>Commit {entry.sequence}</small>
        </li>
      ))}
      {entries.length === 0 ? <li>No Action history yet.</li> : null}
    </ol>
  );
}

export function EvidenceView(props: {
  readonly bindingIds: readonly string[];
}) {
  const { data } = useSurfaceInteraction();
  const evidence = props.bindingIds.flatMap((bindingId) =>
    (data.queries[bindingId]?.values ?? []).flatMap((value) => value.evidence),
  );
  return (
    <ul className="evidence-list" aria-label="Evidence references">
      {evidence.map((item) => (
        <li key={`${item.claimId}.${item.role}`}>
          <code>{item.claimId}</code>
          <span>{item.role}</span>
          <a href={item.sourceRef}>{item.sourceRef}</a>
        </li>
      ))}
      {evidence.length === 0 ? <li>No evidence references.</li> : null}
    </ul>
  );
}

export function ExplanationView(props: { readonly bindingId: string }) {
  const { data } = useSurfaceInteraction();
  const operation = data.actions[props.bindingId];
  const operationId =
    operation !== undefined && "operationId" in operation
      ? operation.operationId
      : undefined;
  return (
    <p className="explanation-ref">
      {operationId === undefined ? (
        "No explanation reference yet."
      ) : (
        <>
          Explanation reference <code>{operationId}</code>
        </>
      )}
    </p>
  );
}

function queryValues(result: QueryBindingView | undefined): string {
  if (result === undefined) {
    return "Loading";
  }
  if (result.values.length === 0) {
    return "No values";
  }
  return result.values.map((value) => exactValueText(value.value)).join(", ");
}

function exactValueText(value: SurfaceExactValue): string {
  switch (value.kind) {
    case "bool":
      return value.value ? "True" : "False";
    case "decimal":
    case "entity-ref":
    case "integer":
    case "text":
      return value.value;
    case "quantity":
      return `${value.amount} ${value.unit}`;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function bindingLabel(bindingId: string): string {
  return bindingId.split(".").at(-1) ?? bindingId;
}

function isBusy(operation: ActionOperationView): boolean {
  return operation.kind === "committing" || operation.kind === "recovering";
}

function operationText(operation: ActionOperationView): string {
  switch (operation.kind) {
    case "idle":
      return "Ready for proposal.";
    case "proposed":
      return `Proposal ${operation.proposalId} is ready for commit.`;
    case "committing":
      return `Committing ${operation.operationId}.`;
    case "recovering":
      return `Commit response was lost. Recovering ${operation.operationId}.`;
    case "committed":
      return operation.effects.some(
        (effect) => effect.kind === "pending" || effect.kind === "unknown",
      )
        ? `Committed locally at sequence ${operation.commitSequence}. External effect is not complete.`
        : `Committed at sequence ${operation.commitSequence}.`;
    case "denied":
      return `Server denied the Action. ${operation.error}`;
    case "failed":
      return `Action failed. ${operation.error}`;
    case "stale":
      return `The form basis is stale. ${operation.error}`;
    case "unavailable":
      return `The Action is no longer available. ${operation.error}`;
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function effectText(effect: EffectStatusView): string {
  switch (effect.kind) {
    case "none":
      return "No external effect.";
    case "pending":
      return `Effect ${effect.effectRequestId} is pending.`;
    case "unknown":
      return `Effect ${effect.effectRequestId} has an unknown outcome.`;
    case "settled":
      return effect.outcome === "confirmed"
        ? `Effect ${effect.effectRequestId} is confirmed.`
        : `Effect ${effect.effectRequestId} is confirmed with no external change.`;
    case "contradicted":
      return `Effect ${effect.effectRequestId} has contradictory evidence.`;
    default: {
      const exhaustive: never = effect;
      return exhaustive;
    }
  }
}
