use std::{
    collections::BTreeSet,
    error::Error,
    fmt::{Display, Formatter},
};

use zoen_core::{
    ClassificationToken, Consistency, DefinitionReference, EntityId, ExactValue, PolicyEvaluation,
    RelationId, ResourceId, SemanticQuery, SemanticResult, SemanticSelection, SemanticValue,
    TimestampMicros, TrustedExecutionContext, classified_as_relation, world_read_action,
};

use crate::{
    PolicyEvaluator, PolicyMembershipProjection, PolicyObjectProjection, PolicyOperation,
    PolicyRequest, PolicyWorldProjection, QueryExecutor, QueryPortError,
};

pub const MAX_TYPE_PAGE: u32 = 100;
pub const MAC_DETERMINING_POLICY: &str = "zoen.mac.dominates";

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PolicySchema {
    pub hop_paths: Vec<Vec<RelationId>>,
}

impl PolicySchema {
    #[must_use]
    pub fn one_hop() -> Self {
        Self {
            hop_paths: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadAbsence {
    World,
    PinnedHost,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReadError {
    Evaluation(String),
    Invalid(String),
    Query(QueryPortError),
}

impl Display for ReadError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Evaluation(message) => write!(formatter, "read evaluation failed: {message}"),
            Self::Invalid(message) => write!(formatter, "invalid read: {message}"),
            Self::Query(error) => error.fmt(formatter),
        }
    }
}

impl Error for ReadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Query(error) => Some(error),
            Self::Evaluation(_) | Self::Invalid(_) => None,
        }
    }
}

#[derive(Clone)]
pub struct ReadEngine<Q, P> {
    policy: P,
    query: Q,
    schema: PolicySchema,
}

impl<Q, P> ReadEngine<Q, P> {
    pub fn new(query: Q, policy: P) -> Self {
        Self {
            policy,
            query,
            schema: PolicySchema::one_hop(),
        }
    }

    #[must_use]
    pub fn with_schema(mut self, schema: PolicySchema) -> Self {
        self.schema = schema;
        self
    }

    pub fn schema(&self) -> &PolicySchema {
        &self.schema
    }
}

impl<Q, P> ReadEngine<Q, P>
where
    Q: QueryExecutor,
    P: PolicyEvaluator,
{
    /// Execute a world read, applying MAC and policy absence.
    ///
    /// # Errors
    ///
    /// Returns [`ReadError`] when the query is invalid, the query port fails, or policy evaluation fails.
    pub async fn execute(
        &self,
        context: &TrustedExecutionContext,
        query: &SemanticQuery,
    ) -> Result<SemanticResult, ReadError> {
        self.run(context, query, ReadAbsence::World).await
    }

    /// Execute a pinned-host read, applying MAC and policy absence.
    ///
    /// # Errors
    ///
    /// Returns [`ReadError`] when the query is invalid, the query port fails, or policy evaluation fails.
    pub async fn execute_pinned(
        &self,
        context: &TrustedExecutionContext,
        query: &SemanticQuery,
    ) -> Result<SemanticResult, ReadError> {
        self.run(context, query, ReadAbsence::PinnedHost).await
    }

    /// Evaluate read policy for one entity without returning its values.
    ///
    /// # Errors
    ///
    /// Returns [`ReadError`] when the entity id is invalid, projection load fails, or the query port fails.
    pub async fn authorize_entity(
        &self,
        context: &TrustedExecutionContext,
        definition: &DefinitionReference,
        entity_id: &EntityId,
        valid_at: TimestampMicros,
    ) -> Result<PolicyEvaluation, ReadError> {
        let projection = self
            .load_read_projection(context, definition, entity_id, valid_at)
            .await?;
        let action_id = world_read_action();
        let resource_id = ResourceId::parse(entity_id.as_str())
            .map_err(|error| ReadError::Invalid(error.to_string()))?;
        Ok(self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &action_id,
                approved: false,
                classification: None,
                context,
                definition,
                inputs: &[],
                operation: PolicyOperation::Read,
                projection: Some(&projection),
                resource_id: &resource_id,
                written_classification: None,
            })
            .await)
    }

    async fn run(
        &self,
        context: &TrustedExecutionContext,
        query: &SemanticQuery,
        absence: ReadAbsence,
    ) -> Result<SemanticResult, ReadError> {
        if let SemanticQuery::ByType { limit, .. } = query
            && *limit > MAX_TYPE_PAGE
        {
            return Err(ReadError::Invalid(format!(
                "type query limit exceeds {MAX_TYPE_PAGE}"
            )));
        }
        let mut result = self
            .query
            .execute(context, query)
            .await
            .map_err(ReadError::Query)?;
        let mut kept = Vec::with_capacity(result.values.len());
        let mut seen = BTreeSet::new();
        let mut decisions = BTreeSet::new();
        for value in result.values {
            let entity_id = entity_id_of(query, &value)?;
            if seen.insert(entity_id.clone()) {
                let evaluation = self
                    .authorize_entity(context, query.definition(), &entity_id, query.valid_at())
                    .await?;
                match evaluation {
                    PolicyEvaluation::Permit(_) => {
                        decisions.insert(entity_id.clone());
                    }
                    PolicyEvaluation::Deny(_) => {
                        if absence == ReadAbsence::PinnedHost {
                            return Err(ReadError::Evaluation(
                                "capability-required entity was denied".to_owned(),
                            ));
                        }
                    }
                    PolicyEvaluation::EvaluationError { message, .. } => {
                        return Err(ReadError::Evaluation(message));
                    }
                }
            }
            if decisions.contains(&entity_id) {
                kept.push(value);
            }
        }
        if absence == ReadAbsence::PinnedHost
            && let SemanticQuery::ByEntity { entity_id, .. } = query
            && !decisions.contains(entity_id)
        {
            return Err(ReadError::Evaluation(
                "capability-required entity was denied".to_owned(),
            ));
        }
        result.values = kept;
        Ok(result)
    }

    async fn load_read_projection(
        &self,
        context: &TrustedExecutionContext,
        definition: &DefinitionReference,
        entity_id: &EntityId,
        valid_at: TimestampMicros,
    ) -> Result<PolicyWorldProjection, ReadError> {
        let classified_as = classified_as_relation();
        let classification = match self
            .query
            .execute(
                context,
                &SemanticQuery::ByEntity {
                    consistency: Consistency::Strong,
                    definition: definition.clone(),
                    entity_id: entity_id.clone(),
                    scenario_id: None,
                    selection: SemanticSelection::Relation(classified_as),
                    valid_at,
                },
            )
            .await
        {
            Ok(result) => classification_tokens(&result.values)?,
            Err(QueryPortError::Invalid(_)) => BTreeSet::new(),
            Err(error) => return Err(ReadError::Query(error)),
        };
        Ok(PolicyWorldProjection {
            membership: PolicyMembershipProjection {
                principal_id: context.principal_id().clone(),
                world_id: context.world_id().clone(),
            },
            neighbors: Vec::new(),
            resource: PolicyObjectProjection {
                classification,
                entity_id: entity_id.clone(),
                links: Vec::new(),
                object_type: None,
            },
        })
    }
}

fn entity_id_of(query: &SemanticQuery, value: &SemanticValue) -> Result<EntityId, ReadError> {
    match query {
        SemanticQuery::ByEntity { entity_id, .. } => Ok(entity_id.clone()),
        SemanticQuery::ByType { .. } => match &value.value {
            ExactValue::Entity(entity_id) => Ok(entity_id.clone()),
            _ => Err(ReadError::Invalid(
                "type query candidate is not an entity id".to_owned(),
            )),
        },
    }
}

fn classification_tokens(
    values: &[SemanticValue],
) -> Result<BTreeSet<ClassificationToken>, ReadError> {
    let mut tokens = BTreeSet::new();
    for value in values {
        let ExactValue::Text(token) = &value.value else {
            return Err(ReadError::Evaluation(
                "classifiedAs values must be text tokens".to_owned(),
            ));
        };
        tokens.insert(
            ClassificationToken::parse(token.clone())
                .map_err(|error| ReadError::Evaluation(error.to_string()))?,
        );
    }
    Ok(tokens)
}
