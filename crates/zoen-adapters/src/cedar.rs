use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::Path;
use std::str::FromStr;

use cedar_policy::{Authorizer, Context, Decision, Entities, EntityUid, PolicySet, Request};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use zoen_core::{
    ExactValue, PolicyDigest, PolicyEvaluation, PolicyEvidence, PolicyId, PolicyRevision,
    PolicyRevisionNumber,
};
use zoen_engine::{PolicyEvaluator, PolicyOperation, PolicyRequest};

#[derive(Debug)]
pub enum CedarConfigError {
    Invalid(String),
    Read(std::io::Error),
}

impl Display for CedarConfigError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) => {
                write!(formatter, "invalid Cedar policy configuration: {message}")
            }
            Self::Read(error) => write!(
                formatter,
                "failed to read Cedar policy configuration: {error}"
            ),
        }
    }
}

impl Error for CedarConfigError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Read(error) => Some(error),
            Self::Invalid(_) => None,
        }
    }
}

pub struct CedarPolicyEvaluator {
    policies: BTreeMap<(String, String), CompiledPolicy>,
}

struct CompiledPolicy {
    policies: PolicySet,
    revision: PolicyRevision,
}

impl CedarPolicyEvaluator {
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, CedarConfigError> {
        let source = fs::read_to_string(path).map_err(CedarConfigError::Read)?;
        Self::from_json(&source)
    }

    pub fn from_json(source: &str) -> Result<Self, CedarConfigError> {
        let manifest = serde_json::from_str::<PolicyManifest>(source)
            .map_err(|error| CedarConfigError::Invalid(error.to_string()))?;
        let mut policies = BTreeMap::new();
        for entry in manifest.policies {
            let actual_digest = sha256(entry.source.as_bytes());
            if actual_digest != entry.digest {
                return Err(CedarConfigError::Invalid(format!(
                    "policy {} digest mismatch",
                    entry.policy_id
                )));
            }
            let revision = PolicyRevision {
                digest: PolicyDigest::parse(entry.digest)
                    .map_err(|error| CedarConfigError::Invalid(error.to_string()))?,
                id: PolicyId::parse(&entry.policy_id)
                    .map_err(|error| CedarConfigError::Invalid(error.to_string()))?,
                revision: PolicyRevisionNumber::new(entry.revision).ok_or_else(|| {
                    CedarConfigError::Invalid(format!(
                        "policy {} revision must be positive",
                        entry.policy_id
                    ))
                })?,
            };
            let policy_set = PolicySet::from_str(&entry.source)
                .map_err(|error| CedarConfigError::Invalid(error.to_string()))?;
            let key = (entry.definition_digest, entry.action_id);
            if policies
                .insert(
                    key,
                    CompiledPolicy {
                        policies: policy_set,
                        revision,
                    },
                )
                .is_some()
            {
                return Err(CedarConfigError::Invalid(
                    "duplicate definition and Action policy binding".to_owned(),
                ));
            }
        }
        Ok(Self { policies })
    }
}

impl PolicyEvaluator for CedarPolicyEvaluator {
    async fn evaluate(&self, request: &PolicyRequest<'_>) -> PolicyEvaluation {
        let key = (
            request.definition.digest.as_str().to_owned(),
            request.action_id.as_str().to_owned(),
        );
        let Some(policy) = self.policies.get(&key) else {
            return PolicyEvaluation::EvaluationError {
                message: "no Cedar policy is installed for this definition and Action".to_owned(),
                revision: None,
            };
        };
        let cedar_request = match cedar_request(request) {
            Ok(request) => request,
            Err(message) => {
                return PolicyEvaluation::EvaluationError {
                    message,
                    revision: Some(policy.revision.clone()),
                };
            }
        };
        let response =
            Authorizer::new().is_authorized(&cedar_request, &policy.policies, &Entities::empty());
        let errors = response
            .diagnostics()
            .errors()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        if !errors.is_empty() {
            return PolicyEvaluation::EvaluationError {
                message: errors.join("; "),
                revision: Some(policy.revision.clone()),
            };
        }
        let mut determining_policies = response
            .diagnostics()
            .reason()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        determining_policies.sort();
        let evidence = PolicyEvidence {
            determining_policies,
            revision: policy.revision.clone(),
        };
        match response.decision() {
            Decision::Allow => PolicyEvaluation::Permit(evidence),
            Decision::Deny => PolicyEvaluation::Deny(evidence),
        }
    }
}

fn cedar_request(request: &PolicyRequest<'_>) -> Result<Request, String> {
    let principal = entity_uid("Zoen::Principal", request.context.principal_id().as_str())?;
    let action = entity_uid("Action", operation_name(request.operation))?;
    let resource = entity_uid("Zoen::Resource", request.resource_id.as_str())?;
    let inputs = request
        .inputs
        .iter()
        .map(|input| {
            cedar_value(input.id.as_str(), &input.value)
                .map(|value| (input.id.as_str().to_owned(), value))
        })
        .collect::<Result<serde_json::Map<_, _>, _>>()?;
    let context = Context::from_json_value(
        serde_json::json!({
            "actionId": request.action_id.as_str(),
            "actorId": request.context.actor_id().as_str(),
            "approved": request.approved,
            "classification": request.classification
                .map(zoen_core::EvolutionClassification::as_str)
                .unwrap_or("none"),
            "inputs": inputs,
            "tenantId": request.context.tenant_id().as_str(),
            "workloadId": request.context.workload_id().as_str()
        }),
        None,
    )
    .map_err(|error| error.to_string())?;
    Request::new(principal, action, resource, context, None).map_err(|error| error.to_string())
}

fn cedar_value(input_id: &str, value: &ExactValue) -> Result<serde_json::Value, String> {
    match value {
        ExactValue::Bool(value) => Ok(serde_json::Value::Bool(*value)),
        ExactValue::Entity(value) => Ok(serde_json::Value::String(value.as_str().to_owned())),
        ExactValue::Integer(value) => value
            .as_str()
            .parse::<i64>()
            .map(serde_json::Value::from)
            .map_err(|_| format!("Action input {input_id} exceeds Cedar's integer range")),
        ExactValue::Decimal(value) => Ok(serde_json::Value::String(value.as_str().to_owned())),
        ExactValue::Quantity { amount, unit } => Ok(serde_json::json!({
            "amount": amount.as_str(),
            "unit": unit.as_str()
        })),
        ExactValue::Text(value) => Ok(serde_json::Value::String(value.clone())),
    }
}

fn operation_name(operation: PolicyOperation) -> &'static str {
    match operation {
        PolicyOperation::ActivateRevision => "activate_revision",
        PolicyOperation::ApplyMigrationBatch => "apply_migration_batch",
        PolicyOperation::Approve => "approve",
        PolicyOperation::Commit => "commit",
        PolicyOperation::Discover => "discover",
        PolicyOperation::PrepareMigration => "prepare_migration",
        PolicyOperation::RequestApproval => "request_approval",
        PolicyOperation::RollbackRevision => "rollback_revision",
    }
}

fn entity_uid(entity_type: &str, id: &str) -> Result<EntityUid, String> {
    EntityUid::from_str(&format!("{entity_type}::{id:?}")).map_err(|error| error.to_string())
}

fn sha256(value: &[u8]) -> String {
    Sha256::digest(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PolicyManifest {
    policies: Vec<PolicyEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PolicyEntry {
    action_id: String,
    definition_digest: String,
    digest: String,
    policy_id: String,
    revision: u64,
    source: String,
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use zoen_core::{
        ActionId, ActorId, DefinitionDigest, DefinitionId, DefinitionReference,
        DefinitionRevisionNumber, DelegationChain, DelegationGrant, DelegationId, ExactInteger,
        InputId, PrincipalId, ResourceId, TenantId, TimestampMicros, TrustedExecutionContext,
        WorkloadId,
    };

    use super::{CedarPolicyEvaluator, sha256};
    use crate::cedar::PolicyEvaluator;
    use zoen_engine::{PolicyOperation, PolicyRequest};

    #[tokio::test]
    async fn distinguishes_permit_deny_and_evaluation_error() {
        let definition_digest = "a".repeat(64);
        let permit_source = r#"permit(principal, action == Action::"commit", resource) when { context.inputs.quantity <= 5 };"#;
        let error_source = r#"permit(principal, action == Action::"commit", resource) when { context.missing == true };"#;
        let evaluator = CedarPolicyEvaluator::from_json(&format!(
            r#"{{"policies":[
                {{"actionId":"action.purchase","definitionDigest":"{definition_digest}","digest":"{}","policyId":"policy.permit","revision":1,"source":{}}},
                {{"actionId":"action.error","definitionDigest":"{definition_digest}","digest":"{}","policyId":"policy.error","revision":1,"source":{}}}
            ]}}"#,
            sha256(permit_source.as_bytes()),
            serde_json::to_string(permit_source).expect("source"),
            sha256(error_source.as_bytes()),
            serde_json::to_string(error_source).expect("source"),
        ))
        .expect("manifest");
        let context = trusted_context("action.purchase");
        let action = ActionId::parse("action.purchase").expect("action");
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse("definition.test").expect("definition"),
            digest: DefinitionDigest::parse(&definition_digest).expect("digest"),
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
        };
        let resource = ResourceId::parse("resource.item").expect("resource");
        let input = zoen_core::ActionInput {
            id: InputId::parse("quantity").expect("input"),
            value: zoen_core::ExactValue::Integer(ExactInteger::parse("5").expect("integer")),
        };
        let permit = evaluator
            .evaluate(&PolicyRequest {
                action_id: &action,
                approved: false,
                classification: None,
                context: &context,
                definition: &definition,
                inputs: &[input],
                operation: PolicyOperation::Commit,
                resource_id: &resource,
            })
            .await;
        assert!(matches!(permit, zoen_core::PolicyEvaluation::Permit(_)));

        let error_action = ActionId::parse("action.error").expect("action");
        let error_context = trusted_context("action.error");
        let error = evaluator
            .evaluate(&PolicyRequest {
                action_id: &error_action,
                approved: false,
                classification: None,
                context: &error_context,
                definition: &definition,
                inputs: &[],
                operation: PolicyOperation::Commit,
                resource_id: &resource,
            })
            .await;
        assert!(matches!(
            error,
            zoen_core::PolicyEvaluation::EvaluationError { .. }
        ));
    }

    #[tokio::test]
    async fn reports_the_input_that_exceeds_cedars_integer_range() {
        let definition_digest = "a".repeat(64);
        let source = r#"permit(principal, action, resource);"#;
        let evaluator = CedarPolicyEvaluator::from_json(&format!(
            r#"{{"policies":[{{"actionId":"action.purchase","definitionDigest":"{definition_digest}","digest":"{}","policyId":"policy.permit","revision":1,"source":{}}}]}}"#,
            sha256(source.as_bytes()),
            serde_json::to_string(source).expect("source"),
        ))
        .expect("manifest");
        let context = trusted_context("action.purchase");
        let action = ActionId::parse("action.purchase").expect("action");
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse("definition.test").expect("definition"),
            digest: DefinitionDigest::parse(&definition_digest).expect("digest"),
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
        };
        let resource = ResourceId::parse("resource.item").expect("resource");
        let input = zoen_core::ActionInput {
            id: InputId::parse("quantity").expect("input"),
            value: zoen_core::ExactValue::Integer(
                ExactInteger::parse("9223372036854775808").expect("integer"),
            ),
        };

        let evaluation = evaluator
            .evaluate(&PolicyRequest {
                action_id: &action,
                approved: false,
                classification: None,
                context: &context,
                definition: &definition,
                inputs: &[input],
                operation: PolicyOperation::Commit,
                resource_id: &resource,
            })
            .await;

        assert!(matches!(
            evaluation,
            zoen_core::PolicyEvaluation::EvaluationError { message, .. }
                if message.contains("quantity") && message.contains("integer range")
        ));
    }

    fn trusted_context(action: &str) -> TrustedExecutionContext {
        let action_id = ActionId::parse(action).expect("action");
        let resource_id = ResourceId::parse("resource.item").expect("resource");
        let workload_id = WorkloadId::parse("workload.agent").expect("workload");
        let grant = DelegationGrant::new(
            DelegationId::parse("delegation.test").expect("delegation"),
            BTreeSet::from([action_id]),
            BTreeSet::from([resource_id]),
            BTreeSet::from([workload_id.clone()]),
            TimestampMicros::new(0),
            TimestampMicros::new(i64::MAX),
        )
        .expect("grant");
        TrustedExecutionContext::new(
            TenantId::parse("tenant.test").expect("tenant"),
            ActorId::parse("actor.test").expect("actor"),
            PrincipalId::parse("principal.test").expect("principal"),
            workload_id,
            DelegationChain::new(vec![grant]).expect("chain"),
        )
    }
}
