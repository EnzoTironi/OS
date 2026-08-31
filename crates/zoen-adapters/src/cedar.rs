use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    fmt::{Display, Formatter},
    fs,
    path::Path,
    str::FromStr,
};

use cedar_policy::{Authorizer, Context, Decision, Entities, EntityUid, PolicySet, Request};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use zoen_core::{
    Clearance, ExactValue, PolicyDigest, PolicyEvaluation, PolicyEvidence, PolicyId,
    PolicyRevision, PolicyRevisionNumber, resource_label,
};
use zoen_engine::{
    MAC_DETERMINING_POLICY, PolicyEvaluator, PolicyObjectProjection, PolicyOperation,
    PolicyRequest, PolicyWorldProjection,
};

const CEDAR_STACK_RED_ZONE: usize = 1024 * 1024;
const CEDAR_STACK_SIZE: usize = 2 * 1024 * 1024;

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
    /// Load Cedar policies from a JSON manifest file.
    ///
    /// # Errors
    ///
    /// Returns [`CedarConfigError`] when the file cannot be read or the manifest
    /// is invalid.
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, CedarConfigError> {
        let source = fs::read_to_string(path).map_err(CedarConfigError::Read)?;
        Self::from_json(&source)
    }

    /// Compile Cedar policies from a JSON manifest.
    ///
    /// # Errors
    ///
    /// Returns [`CedarConfigError::Invalid`] when the manifest, digest, or
    /// policy source cannot be compiled.
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
        let Some(projection) = request.projection else {
            return PolicyEvaluation::EvaluationError {
                message: "policy projection is required".to_owned(),
                revision: None,
            };
        };
        if projection.membership.principal_id != *request.context.principal_id()
            || projection.membership.tenant_id != *request.context.tenant_id()
            || projection.resource.entity_id.as_str() != request.resource_id.as_str()
        {
            return PolicyEvaluation::EvaluationError {
                message: "policy projection must contain Tenant, Principal, and Resource"
                    .to_owned(),
                revision: None,
            };
        }
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
        let label = resource_label(projection.resource.classification.iter().cloned());
        if !request.context.clearance().dominates(&label) {
            return PolicyEvaluation::Deny(PolicyEvidence {
                determining_policies: vec![MAC_DETERMINING_POLICY.to_owned()],
                revision: policy.revision.clone(),
            });
        }
        if let Some(written) = request.written_classification {
            if !zoen_core::mac_write_permitted(request.context.clearance(), written) {
                return PolicyEvaluation::Deny(PolicyEvidence {
                    determining_policies: vec![MAC_DETERMINING_POLICY.to_owned()],
                    revision: policy.revision.clone(),
                });
            }
        }
        let response = match stacker::maybe_grow(CEDAR_STACK_RED_ZONE, CEDAR_STACK_SIZE, || {
            let cedar_request = cedar_request(request)?;
            let entities = cedar_entities(request, projection)?;
            Ok::<_, String>(Authorizer::new().is_authorized(
                &cedar_request,
                &policy.policies,
                &entities,
            ))
        }) {
            Ok(response) => response,
            Err(message) => {
                return PolicyEvaluation::EvaluationError {
                    message,
                    revision: Some(policy.revision.clone()),
                };
            }
        };
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
        determining_policies.push(MAC_DETERMINING_POLICY.to_owned());
        determining_policies.sort();
        determining_policies.dedup();
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

fn cedar_entities(
    request: &PolicyRequest<'_>,
    projection: &PolicyWorldProjection,
) -> Result<Entities, String> {
    let entities = Entities::from_json_value(
        projection_json(projection, request.context.clearance()),
        None,
    )
    .map_err(|error| error.to_string())?;
    if entities.is_empty() {
        return Err("Cedar world projection produced no entities".to_owned());
    }
    Ok(entities)
}

fn projection_json(projection: &PolicyWorldProjection, clearance: &Clearance) -> serde_json::Value {
    let mut entities = Vec::new();
    let mut seen = BTreeSet::new();
    push_cedar_entity(
        &mut entities,
        &mut seen,
        "Zoen::Tenant",
        projection.membership.tenant_id.as_str(),
        &serde_json::json!({}),
        &[],
    );
    let principal_attrs = serde_json::json!({
        "clearance": clearance
            .tokens()
            .iter()
            .map(|token| serde_json::Value::String(token.as_str().to_owned()))
            .collect::<Vec<_>>(),
        "tenantId": projection.membership.tenant_id.as_str()
    });
    let principal_parents = [serde_json::json!({
        "type": "Zoen::Tenant",
        "id": projection.membership.tenant_id.as_str()
    })];
    push_cedar_entity(
        &mut entities,
        &mut seen,
        "Zoen::Principal",
        projection.membership.principal_id.as_str(),
        &principal_attrs,
        &principal_parents,
    );
    push_object_entity(&mut entities, &mut seen, &projection.resource);
    for neighbor in &projection.neighbors {
        push_object_entity(&mut entities, &mut seen, neighbor);
    }
    serde_json::Value::Array(entities)
}

fn push_object_entity(
    entities: &mut Vec<serde_json::Value>,
    seen: &mut BTreeSet<(String, String)>,
    object: &PolicyObjectProjection,
) {
    let attrs = object_attrs(object);
    push_cedar_entity(
        entities,
        seen,
        "Zoen::Resource",
        object.entity_id.as_str(),
        &attrs,
        &[],
    );
}

fn object_attrs(object: &PolicyObjectProjection) -> serde_json::Value {
    let mut attrs = serde_json::Map::new();
    attrs.insert(
        "classifiedAs".to_owned(),
        serde_json::Value::Array(
            resource_label(object.classification.iter().cloned())
                .into_iter()
                .map(|token| serde_json::Value::String(token.as_str().to_owned()))
                .collect(),
        ),
    );
    if let Some(object_type) = &object.object_type {
        attrs.insert(
            "objectType".to_owned(),
            serde_json::Value::String(object_type.as_str().to_owned()),
        );
    }
    for link in &object.links {
        let value = match link.targets.as_slice() {
            [] => continue,
            [target] => cedar_entity_ref(target.as_str()),
            targets => serde_json::Value::Array(
                targets
                    .iter()
                    .map(|target| cedar_entity_ref(target.as_str()))
                    .collect(),
            ),
        };
        attrs.insert(cedar_attr_name(link.relation_id.as_str()), value);
    }
    serde_json::Value::Object(attrs)
}

fn cedar_entity_ref(id: &str) -> serde_json::Value {
    serde_json::json!({
        "__entity": {
            "type": "Zoen::Resource",
            "id": id
        }
    })
}

// Cedar attribute names cannot contain '.'.
fn cedar_attr_name(relation_id: &str) -> String {
    relation_id.replace('.', "_")
}

fn push_cedar_entity(
    entities: &mut Vec<serde_json::Value>,
    seen: &mut BTreeSet<(String, String)>,
    entity_type: &str,
    id: &str,
    attrs: &serde_json::Value,
    parents: &[serde_json::Value],
) {
    if !seen.insert((entity_type.to_owned(), id.to_owned())) {
        return;
    }
    entities.push(serde_json::json!({
        "uid": { "type": entity_type, "id": id },
        "attrs": attrs,
        "parents": parents
    }));
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
                .map_or("none", zoen_core::EvolutionClassification::as_str),
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
        PolicyOperation::Read => "read",
        PolicyOperation::RequestApproval => "request_approval",
        PolicyOperation::RollbackRevision => "rollback_revision",
    }
}

fn entity_uid(entity_type: &str, id: &str) -> Result<EntityUid, String> {
    EntityUid::from_str(&format!("{entity_type}::{id:?}")).map_err(|error| error.to_string())
}

fn sha256(value: &[u8]) -> String {
    zoen_core::encode_hex(&Sha256::digest(value))
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
        ActionId, ActorId, ClassificationToken, DefinitionDigest, DefinitionId,
        DefinitionReference, DefinitionRevisionNumber, DelegationChain, DelegationGrant,
        DelegationId, EntityId, ExactInteger, InputId, PrincipalId, RelationId, ResourceId,
        TenantId, TimestampMicros, TrustedExecutionContext, TypeId, WorkloadId,
    };

    use super::{CedarPolicyEvaluator, sha256};
    use crate::cedar::PolicyEvaluator;
    use zoen_engine::{
        PolicyLinkProjection, PolicyMembershipProjection, PolicyObjectProjection, PolicyOperation,
        PolicyRequest, PolicyWorldProjection,
    };

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
        let projection = floor_world(&context, &resource);
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
                projection: Some(&projection),
                resource_id: &resource,
                written_classification: None,
            })
            .await;
        assert!(matches!(permit, zoen_core::PolicyEvaluation::Permit(_)));

        let error_action = ActionId::parse("action.error").expect("action");
        let error_context = trusted_context("action.error");
        let error_projection = floor_world(&error_context, &resource);
        let error = evaluator
            .evaluate(&PolicyRequest {
                action_id: &error_action,
                approved: false,
                classification: None,
                context: &error_context,
                definition: &definition,
                inputs: &[],
                operation: PolicyOperation::Commit,
                projection: Some(&error_projection),
                resource_id: &resource,
                written_classification: None,
            })
            .await;
        assert!(matches!(
            error,
            zoen_core::PolicyEvaluation::EvaluationError { .. }
        ));
    }

    #[tokio::test]
    async fn fly_personal_activation_permits_admin_and_bound_live_whatsapp() {
        let evaluator =
            CedarPolicyEvaluator::from_json(include_str!("../../../deploy/fly/policies.json"))
                .expect("fly manifest");
        let definition_digest = "fbde8d543caf19596840ae092d99088d222bffdf7d17c2397df00050912e3548";
        let action = ActionId::parse("zoen.definition.activate").expect("action");
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse("personal.memory").expect("definition"),
            digest: DefinitionDigest::parse(definition_digest).expect("digest"),
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
        };
        let resource = ResourceId::parse("personal.memory").expect("resource");

        let admin = fly_activation_context("principal.admin.a");
        let admin_world = owner_world(&admin, &resource);
        assert!(matches!(
            evaluator
                .evaluate(&PolicyRequest {
                    action_id: &action,
                    approved: false,
                    classification: None,
                    context: &admin,
                    definition: &definition,
                    inputs: &[],
                    operation: PolicyOperation::ActivateRevision,
                    projection: Some(&admin_world),
                    resource_id: &resource,
                    written_classification: None,
                })
                .await,
            zoen_core::PolicyEvaluation::Permit(_)
        ));

        let live = fly_activation_context("principal.live.whatsapp");
        let live_world = owner_world(&live, &resource);
        assert!(matches!(
            evaluator
                .evaluate(&PolicyRequest {
                    action_id: &action,
                    approved: false,
                    classification: None,
                    context: &live,
                    definition: &definition,
                    inputs: &[],
                    operation: PolicyOperation::ActivateRevision,
                    projection: Some(&live_world),
                    resource_id: &resource,
                    written_classification: None,
                })
                .await,
            zoen_core::PolicyEvaluation::Permit(_)
        ));

        let stranger = fly_activation_context("principal.stranger.a");
        let stranger_world = owner_world(&stranger, &resource);
        assert!(matches!(
            evaluator
                .evaluate(&PolicyRequest {
                    action_id: &action,
                    approved: false,
                    classification: None,
                    context: &stranger,
                    definition: &definition,
                    inputs: &[],
                    operation: PolicyOperation::ActivateRevision,
                    projection: Some(&stranger_world),
                    resource_id: &resource,
                    written_classification: None,
                })
                .await,
            zoen_core::PolicyEvaluation::Deny(_)
        ));
    }

    #[tokio::test]
    async fn reports_the_input_that_exceeds_cedars_integer_range() {
        let definition_digest = "a".repeat(64);
        let source = r"permit(principal, action, resource);";
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
        let projection = floor_world(&context, &resource);
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
                projection: Some(&projection),
                resource_id: &resource,
                written_classification: None,
            })
            .await;

        assert!(matches!(
            evaluation,
            zoen_core::PolicyEvaluation::EvaluationError { message, .. }
                if message.contains("quantity") && message.contains("integer range")
        ));
    }

    #[tokio::test]
    async fn permits_one_object_and_denies_a_neighbor_of_the_same_type() {
        let definition_digest = "a".repeat(64);
        let source = r#"@id("permit-named-order-line")
permit (
    principal,
    action == Action::"commit",
    resource == Zoen::Resource::"commercial.order-line.permitted"
)
when {
    principal in Zoen::Tenant::"tenant.test" &&
    resource has objectType &&
    resource.objectType == "commercial.OrderLine" &&
    resource has commercial_quoteReference &&
    resource.commercial_quoteReference == Zoen::Resource::"commercial.quote.permitted"
};
"#;
        let evaluator = CedarPolicyEvaluator::from_json(&format!(
            r#"{{"policies":[{{"actionId":"commercial.recordQuote","definitionDigest":"{definition_digest}","digest":"{}","policyId":"policy.recordQuote.r1","revision":1,"source":{}}}]}}"#,
            sha256(source.as_bytes()),
            serde_json::to_string(source).expect("source"),
        ))
        .expect("manifest");
        let context = trusted_context("commercial.recordQuote");
        let action = ActionId::parse("commercial.recordQuote").expect("action");
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse("commercial.sales").expect("definition"),
            digest: DefinitionDigest::parse(&definition_digest).expect("digest"),
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
        };
        let permitted_id = ResourceId::parse("commercial.order-line.permitted").expect("resource");
        let neighbor_id = ResourceId::parse("commercial.order-line.neighbor").expect("resource");
        let permitted_world = order_line_projection(
            &context,
            "commercial.order-line.permitted",
            "commercial.quote.permitted",
        );
        let neighbor_world = order_line_projection(
            &context,
            "commercial.order-line.neighbor",
            "commercial.quote.neighbor",
        );

        let permit = evaluator
            .evaluate(&PolicyRequest {
                action_id: &action,
                approved: false,
                classification: None,
                context: &context,
                definition: &definition,
                inputs: &[],
                operation: PolicyOperation::Commit,
                projection: Some(&permitted_world),
                resource_id: &permitted_id,
                written_classification: None,
            })
            .await;
        let deny = evaluator
            .evaluate(&PolicyRequest {
                action_id: &action,
                approved: false,
                classification: None,
                context: &context,
                definition: &definition,
                inputs: &[],
                operation: PolicyOperation::Commit,
                projection: Some(&neighbor_world),
                resource_id: &neighbor_id,
                written_classification: None,
            })
            .await;
        let empty = evaluator
            .evaluate(&PolicyRequest {
                action_id: &action,
                approved: false,
                classification: None,
                context: &context,
                definition: &definition,
                inputs: &[],
                operation: PolicyOperation::Commit,
                projection: None,
                resource_id: &permitted_id,
                written_classification: None,
            })
            .await;

        match permit {
            zoen_core::PolicyEvaluation::Permit(evidence) => {
                assert_eq!(evidence.revision.id.as_str(), "policy.recordQuote.r1");
                assert_eq!(evidence.revision.revision.get(), 1);
                assert!(!evidence.determining_policies.is_empty());
            }
            other => panic!("expected permit, got {other:?}"),
        }
        assert!(matches!(deny, zoen_core::PolicyEvaluation::Deny(_)));
        assert!(matches!(
            empty,
            zoen_core::PolicyEvaluation::EvaluationError { message, .. }
                if message.contains("policy projection is required")
        ));
    }

    #[tokio::test]
    async fn personal_text_actions_permit_commit_without_quantity() {
        let definition_digest = "b".repeat(64);
        let write_memory = include_str!("../../../testdata/cedar/personal.writeMemory.cedar");
        let create_reminder = include_str!("../../../testdata/cedar/personal.createReminder.cedar");
        assert!(!write_memory.contains("quantity"));
        assert!(!create_reminder.contains("quantity"));
        let evaluator = CedarPolicyEvaluator::from_json(&format!(
            r#"{{"policies":[
                {{"actionId":"personal.writeMemory","definitionDigest":"{definition_digest}","digest":"{}","policyId":"policy.writeMemory.r1","revision":1,"source":{}}},
                {{"actionId":"personal.createReminder","definitionDigest":"{definition_digest}","digest":"{}","policyId":"policy.createReminder.r1","revision":1,"source":{}}}
            ]}}"#,
            sha256(write_memory.as_bytes()),
            serde_json::to_string(write_memory).expect("source"),
            sha256(create_reminder.as_bytes()),
            serde_json::to_string(create_reminder).expect("source"),
        ))
        .expect("manifest");
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse("personal.memory").expect("definition"),
            digest: DefinitionDigest::parse(&definition_digest).expect("digest"),
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
        };
        let resource = ResourceId::parse("personal.note.1").expect("resource");
        let body = zoen_core::ActionInput {
            id: InputId::parse("body").expect("input"),
            value: zoen_core::ExactValue::Text("comprar pão".to_owned()),
        };
        let due_at = zoen_core::ActionInput {
            id: InputId::parse("dueAt").expect("input"),
            value: zoen_core::ExactValue::Text("amanhã 15h".to_owned()),
        };

        for (action_id, inputs) in [
            ("personal.writeMemory", vec![body.clone()]),
            ("personal.createReminder", vec![body, due_at]),
        ] {
            let context = trusted_context(action_id);
            let action = ActionId::parse(action_id).expect("action");
            let projection = floor_world(&context, &resource);
            let commit = evaluator
                .evaluate(&PolicyRequest {
                    action_id: &action,
                    approved: false,
                    classification: None,
                    context: &context,
                    definition: &definition,
                    inputs: &inputs,
                    operation: PolicyOperation::Commit,
                    projection: Some(&projection),
                    resource_id: &resource,
                    written_classification: None,
                })
                .await;
            assert!(
                matches!(commit, zoen_core::PolicyEvaluation::Permit(_)),
                "{action_id} commit should permit, got {commit:?}"
            );
            let discover = evaluator
                .evaluate(&PolicyRequest {
                    action_id: &action,
                    approved: false,
                    classification: None,
                    context: &context,
                    definition: &definition,
                    inputs: &[],
                    operation: PolicyOperation::Discover,
                    projection: Some(&projection),
                    resource_id: &resource,
                    written_classification: None,
                })
                .await;
            assert!(
                matches!(discover, zoen_core::PolicyEvaluation::Permit(_)),
                "{action_id} discover should permit, got {discover:?}"
            );
        }
    }

    fn order_line_projection(
        context: &TrustedExecutionContext,
        resource: &str,
        quote: &str,
    ) -> PolicyWorldProjection {
        PolicyWorldProjection {
            membership: PolicyMembershipProjection {
                principal_id: context.principal_id().clone(),
                tenant_id: context.tenant_id().clone(),
            },
            neighbors: vec![PolicyObjectProjection {
                classification: BTreeSet::from([ClassificationToken::world_floor()]),
                entity_id: EntityId::parse(quote).expect("quote"),
                links: Vec::new(),
                object_type: Some(TypeId::parse("commercial.Quote").expect("type")),
            }],
            resource: PolicyObjectProjection {
                classification: BTreeSet::from([ClassificationToken::world_floor()]),
                entity_id: EntityId::parse(resource).expect("resource"),
                links: vec![PolicyLinkProjection {
                    relation_id: RelationId::parse("commercial.quoteReference").expect("relation"),
                    targets: vec![EntityId::parse(quote).expect("quote")],
                }],
                object_type: Some(TypeId::parse("commercial.OrderLine").expect("type")),
            },
        }
    }

    fn fly_activation_context(principal: &str) -> TrustedExecutionContext {
        let action_id = ActionId::parse("zoen.definition.activate").expect("action");
        let resource_id = ResourceId::parse("personal.memory").expect("resource");
        let workload_id = WorkloadId::parse("workload.admin.a").expect("workload");
        let grant = DelegationGrant::new(
            DelegationId::parse("delegation.admin.a").expect("delegation"),
            BTreeSet::from([action_id]),
            BTreeSet::from([resource_id]),
            BTreeSet::from([workload_id.clone()]),
            TimestampMicros::new(0),
            TimestampMicros::new(i64::MAX),
        )
        .expect("grant");
        TrustedExecutionContext::new(
            TenantId::parse("tenant.a").expect("tenant"),
            ActorId::parse("actor.admin.a").expect("actor"),
            PrincipalId::parse(principal).expect("principal"),
            workload_id,
            DelegationChain::new(vec![grant]).expect("chain"),
            zoen_core::Clearance::personal_owner(),
        )
    }

    fn floor_world(
        context: &TrustedExecutionContext,
        resource: &ResourceId,
    ) -> PolicyWorldProjection {
        labeled_world(context, resource, ClassificationToken::world_floor())
    }

    fn owner_world(
        context: &TrustedExecutionContext,
        resource: &ResourceId,
    ) -> PolicyWorldProjection {
        PolicyWorldProjection {
            membership: PolicyMembershipProjection {
                principal_id: context.principal_id().clone(),
                tenant_id: context.tenant_id().clone(),
            },
            neighbors: Vec::new(),
            resource: PolicyObjectProjection {
                classification: BTreeSet::new(),
                entity_id: EntityId::parse(resource.as_str()).expect("entity"),
                links: Vec::new(),
                object_type: None,
            },
        }
    }

    fn labeled_world(
        context: &TrustedExecutionContext,
        resource: &ResourceId,
        token: ClassificationToken,
    ) -> PolicyWorldProjection {
        PolicyWorldProjection {
            membership: PolicyMembershipProjection {
                principal_id: context.principal_id().clone(),
                tenant_id: context.tenant_id().clone(),
            },
            neighbors: Vec::new(),
            resource: PolicyObjectProjection {
                classification: BTreeSet::from([token]),
                entity_id: EntityId::parse(resource.as_str()).expect("entity"),
                links: Vec::new(),
                object_type: None,
            },
        }
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
            zoen_core::Clearance::world_floor(),
        )
    }
}
