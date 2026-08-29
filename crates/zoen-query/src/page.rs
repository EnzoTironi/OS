use sha2::{Digest, Sha256};
use zoen_core::{CommitSequence, EntityId, ExecutionContext, SemanticQuery};

use crate::QueryError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PageCursor {
    pub after_entity_id: EntityId,
    pub commit_sequence: CommitSequence,
}

pub(crate) fn bind_type_page(
    context: &ExecutionContext,
    query: &SemanticQuery,
) -> Result<Option<PageCursor>, QueryError> {
    let SemanticQuery::ByType { page_token, .. } = query else {
        return Ok(None);
    };
    if page_token.is_empty() {
        return Ok(None);
    }
    let cursor = decode(page_token)?;
    let expected = fingerprint(context, query)?;
    let actual = decode_fingerprint(page_token)?;
    if actual != expected {
        return Err(QueryError::Invalid(
            "page token does not match this semantic query".to_owned(),
        ));
    }
    Ok(Some(cursor))
}

pub(crate) fn next_page_token(
    context: &ExecutionContext,
    query: &SemanticQuery,
    commit_sequence: CommitSequence,
    after_entity_id: Option<&EntityId>,
    has_more: bool,
) -> Result<String, QueryError> {
    if !has_more {
        return Ok(String::new());
    }
    let after = after_entity_id
        .ok_or_else(|| QueryError::Corrupt("type query page is incomplete".to_owned()))?;
    encode(context, query, commit_sequence, after)
}

fn encode(
    context: &ExecutionContext,
    query: &SemanticQuery,
    commit_sequence: CommitSequence,
    after_entity_id: &EntityId,
) -> Result<String, QueryError> {
    Ok(format!(
        "v1/{:x}/{}/{}",
        commit_sequence.get(),
        fingerprint(context, query)?,
        hex_encode(after_entity_id.as_str().as_bytes())
    ))
}

fn decode(token: &str) -> Result<PageCursor, QueryError> {
    let (commit_sequence, after) = parse_parts(token)?;
    Ok(PageCursor {
        after_entity_id: EntityId::parse(after)
            .map_err(|error| QueryError::Invalid(error.to_string()))?,
        commit_sequence,
    })
}

fn decode_fingerprint(token: &str) -> Result<String, QueryError> {
    let parts = split_token(token)?;
    Ok(parts[2].to_owned())
}

fn parse_parts(token: &str) -> Result<(CommitSequence, String), QueryError> {
    let parts = split_token(token)?;
    let commit_sequence = u64::from_str_radix(parts[1], 16)
        .ok()
        .and_then(CommitSequence::new)
        .ok_or_else(|| QueryError::Invalid("page token cut is invalid".to_owned()))?;
    let after = String::from_utf8(hex_decode(parts[3])?)
        .map_err(|_| QueryError::Invalid("page token cursor is invalid".to_owned()))?;
    Ok((commit_sequence, after))
}

fn split_token(token: &str) -> Result<[&str; 4], QueryError> {
    let parts = token.split('/').collect::<Vec<_>>();
    let [version, cut, fingerprint, after] = parts.as_slice() else {
        return Err(QueryError::Invalid("page token is malformed".to_owned()));
    };
    if *version != "v1" || fingerprint.len() != 64 {
        return Err(QueryError::Invalid("page token is malformed".to_owned()));
    }
    Ok([*version, *cut, *fingerprint, *after])
}

fn fingerprint(context: &ExecutionContext, query: &SemanticQuery) -> Result<String, QueryError> {
    let SemanticQuery::ByType {
        definition,
        limit,
        type_id,
        valid_at,
        ..
    } = query
    else {
        return Err(QueryError::Invalid(
            "page token is only valid for type queries".to_owned(),
        ));
    };
    let mut hasher = Sha256::new();
    hash_field(&mut hasher, context.tenant_id().as_str());
    hash_field(&mut hasher, context.principal_id().as_str());
    hash_field(&mut hasher, context.actor_id().as_str());
    hash_field(&mut hasher, context.workload_id().as_str());
    for token in context.clearance().to_token_strings() {
        hash_field(&mut hasher, &token);
    }
    hash_field(&mut hasher, definition.definition_id.as_str());
    hash_field(&mut hasher, definition.digest.as_str());
    hash_field(&mut hasher, &definition.revision.get().to_string());
    hash_field(&mut hasher, type_id.as_str());
    hash_field(&mut hasher, &limit.to_string());
    hash_field(&mut hasher, &valid_at.get().to_string());
    hash_field(
        &mut hasher,
        query.scenario_id().map(|id| id.as_str()).unwrap_or(""),
    );
    Ok(hex_encode(hasher.finalize()))
}

fn hash_field(hasher: &mut Sha256, value: &str) {
    hasher.update(value.len().to_be_bytes());
    hasher.update(value.as_bytes());
}

fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn hex_decode(value: &str) -> Result<Vec<u8>, QueryError> {
    if !value.len().is_multiple_of(2) {
        return Err(QueryError::Invalid(
            "page token cursor is invalid".to_owned(),
        ));
    }
    (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|_| QueryError::Invalid("page token cursor is invalid".to_owned()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use zoen_core::{
        ActionId, ActorId, Consistency, DefinitionDigest, DefinitionId, DefinitionReference,
        DefinitionRevisionNumber, DelegationChain, DelegationGrant, DelegationId, EntityId,
        PrincipalId, ResourceId, SemanticQuery, TenantId, TimestampMicros, TrustedExecutionContext,
        TypeId, WorkloadId,
    };

    use super::{bind_type_page, next_page_token};

    const ZERO_DIGEST: &str = "0000000000000000000000000000000000000000000000000000000000000000";

    #[test]
    fn type_query_next_page_token_is_empty_when_single_page_fits() {
        let query = type_query(10, "");
        let token = next_page_token(
            &context(),
            &query,
            zoen_core::CommitSequence::new(4).expect("cut"),
            Some(&EntityId::parse("entity.item.1").expect("entity")),
            false,
        )
        .expect("token");
        assert!(token.is_empty());
    }

    #[test]
    fn type_query_page_token_is_bound_to_the_query_cut() {
        let query = type_query(2, "");
        let cut = zoen_core::CommitSequence::new(9).expect("cut");
        let token = next_page_token(
            &context(),
            &query,
            cut,
            Some(&EntityId::parse("entity.item.2").expect("entity")),
            true,
        )
        .expect("token");
        let continued = SemanticQuery::ByType {
            consistency: Consistency::Strong,
            definition: definition(),
            limit: 2,
            page_token: token,
            type_id: TypeId::parse("world.Item").expect("type"),
            scenario_id: None,
            valid_at: TimestampMicros::new(1),
        };
        let bound = bind_type_page(&context(), &continued)
            .expect("bind")
            .expect("cursor");
        assert_eq!(bound.commit_sequence, cut);
        assert_eq!(
            bound.after_entity_id,
            EntityId::parse("entity.item.2").expect("entity")
        );
    }

    fn context() -> TrustedExecutionContext {
        let workload = WorkloadId::parse("workload.test").expect("workload");
        let grant = DelegationGrant::new(
            DelegationId::parse("delegation.test").expect("delegation"),
            BTreeSet::from([ActionId::parse("zoen.world.read").expect("action")]),
            BTreeSet::from([ResourceId::parse("world.s2read").expect("resource")]),
            BTreeSet::from([workload.clone()]),
            TimestampMicros::new(0),
            TimestampMicros::new(i64::MAX),
        )
        .expect("grant");
        TrustedExecutionContext::new(
            TenantId::parse("tenant.test").expect("tenant"),
            ActorId::parse("actor.test").expect("actor"),
            PrincipalId::parse("principal.test").expect("principal"),
            workload,
            DelegationChain::new(vec![grant]).expect("chain"),
            zoen_core::Clearance::world_floor(),
        )
    }

    fn definition() -> DefinitionReference {
        DefinitionReference {
            definition_id: DefinitionId::parse("world.definition").expect("definition"),
            digest: DefinitionDigest::parse(ZERO_DIGEST).expect("digest"),
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
        }
    }

    fn type_query(limit: u32, page_token: &str) -> SemanticQuery {
        SemanticQuery::ByType {
            consistency: Consistency::Strong,
            definition: definition(),
            limit,
            page_token: page_token.to_owned(),
            type_id: TypeId::parse("world.Item").expect("type"),
            scenario_id: None,
            valid_at: TimestampMicros::new(1),
        }
    }
}
