use serde::Serialize;
use zoen_core::{
    ActionId, CanonicalJson, DefinitionDigest, DefinitionId, DefinitionPublication,
    DefinitionRevisionNumber, ExecutionContext, PolicyEvaluation, PolicyEvidence, ResourceId,
    TimestampMicros,
};

use crate::{
    AuthorityStore, DefinitionEngine, PolicyEvaluator, PolicyOperation, PolicyRequest,
    ProjectionEvent, PublishError, admission, directory_projection,
};

const DEFINITION_PUBLICATION_ACTION_ID: &str = "zoen.definition.publish";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedDefinitionPublication {
    candidate: admission::DefinitionCandidate,
    context: ExecutionContext,
    policy: PolicyEvidence,
    projection_event: ProjectionEvent,
    published_at: TimestampMicros,
}

impl AdmittedDefinitionPublication {
    fn new(
        candidate: admission::DefinitionCandidate,
        context: ExecutionContext,
        policy: PolicyEvidence,
        published_at: TimestampMicros,
    ) -> Result<Self, PublishError> {
        let reference = candidate.reference();
        let payload = serde_jcs::to_string(&DefinitionPublishedV2 {
            definition_id: reference.definition_id.as_str(),
            determining_policies: &policy.determining_policies,
            digest: reference.digest.as_str(),
            policy_digest: policy.revision.digest.as_str(),
            policy_id: policy.revision.id.as_str(),
            policy_revision: policy.revision.revision.get(),
            principal_id: context.principal_id().as_str(),
            published_at_micros: published_at.get(),
            published_by: context.actor_id().as_str(),
            revision: reference.revision.get(),
            workload_id: context.workload_id().as_str(),
        })
        .map_err(|error| PublishError::EventEncoding(error.to_string()))?;
        Ok(Self {
            candidate,
            context,
            policy,
            projection_event: ProjectionEvent {
                event_type: "DefinitionPublished",
                event_version: 2,
                payload,
            },
            published_at,
        })
    }

    #[must_use]
    pub fn canonical_json(&self) -> &CanonicalJson {
        self.candidate.canonical_json()
    }

    #[must_use]
    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }

    #[must_use]
    pub fn definition_id(&self) -> &DefinitionId {
        &self.candidate.reference().definition_id
    }

    #[must_use]
    pub fn digest(&self) -> &DefinitionDigest {
        &self.candidate.reference().digest
    }

    #[must_use]
    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    #[must_use]
    pub fn projection_event(&self) -> &ProjectionEvent {
        &self.projection_event
    }

    #[must_use]
    pub fn published_at(&self) -> TimestampMicros {
        self.published_at
    }

    #[must_use]
    pub fn revision(&self) -> DefinitionRevisionNumber {
        self.candidate.reference().revision
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DefinitionPublishedV2<'a> {
    definition_id: &'a str,
    determining_policies: &'a [String],
    digest: &'a str,
    policy_digest: &'a str,
    policy_id: &'a str,
    policy_revision: u64,
    principal_id: &'a str,
    published_at_micros: i64,
    published_by: &'a str,
    revision: u64,
    workload_id: &'a str,
}

impl<S, P> DefinitionEngine<S, P>
where
    S: AuthorityStore,
    P: PolicyEvaluator,
{
    /// Admit and publish a canonical definition document.
    ///
    /// # Errors
    ///
    /// Returns [`PublishError`] when admission or authority fails, or the store cannot persist the
    /// publication.
    pub async fn publish(
        &self,
        context: &ExecutionContext,
        canonical_bytes: &[u8],
        claimed_digest: DefinitionDigest,
        published_at: TimestampMicros,
    ) -> Result<DefinitionPublication, PublishError> {
        let candidate = admission::admit(canonical_bytes, claimed_digest)?;
        let action_id = ActionId::parse(DEFINITION_PUBLICATION_ACTION_ID)
            .map_err(|error| PublishError::Configuration(error.to_string()))?;
        let resource_id = ResourceId::parse(candidate.reference().definition_id.as_str())
            .map_err(|error| PublishError::Configuration(error.to_string()))?;
        if !context.delegation().permits(
            &action_id,
            &resource_id,
            context.workload_id(),
            published_at,
        ) {
            return Err(PublishError::DelegationDenied);
        }
        let projection =
            directory_projection(context, &resource_id).map_err(PublishError::Configuration)?;
        let policy = match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &action_id,
                approved: false,
                classification: None,
                context,
                definition: candidate.reference(),
                inputs: &[],
                operation: PolicyOperation::PublishDefinition,
                projection: Some(&projection),
                resource_id: &resource_id,
                written_classification: None,
            })
            .await
        {
            PolicyEvaluation::Permit(policy) => policy,
            PolicyEvaluation::Deny(policy) => return Err(PublishError::PolicyDenied(policy)),
            PolicyEvaluation::EvaluationError { message, revision } => {
                return Err(PublishError::PolicyEvaluation {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                });
            }
        };
        let publication =
            AdmittedDefinitionPublication::new(candidate, context.clone(), policy, published_at)?;
        self.store
            .publish(&publication)
            .await
            .map_err(PublishError::Store)
    }
}
