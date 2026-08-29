use std::error::Error;
use std::fmt::{Display, Formatter};

use crate::{IdentifierError, MembershipId, TenantId, parse_identifier};

pub const CONVERSATION_STAGE_CAP: usize = 32;

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ConversationStageId(String);

impl ConversationStageId {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
        parse_identifier(value.into(), "ConversationStageId").map(Self)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for ConversationStageId {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConversationStage {
    pub id: ConversationStageId,
    pub members: Vec<MembershipId>,
    pub tenant_id: TenantId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConversationStageError {
    Incomplete,
    OverCap { observed: usize },
}

impl Display for ConversationStageError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Incomplete => formatter.write_str(
                "conversation stage member set is incomplete; fail closed, no group reply",
            ),
            Self::OverCap { observed } => write!(
                formatter,
                "conversation stage exceeds cap {CONVERSATION_STAGE_CAP} (observed {observed}); fail closed, no group reply"
            ),
        }
    }
}

impl Error for ConversationStageError {}

impl ConversationStage {
    pub fn plant(id: ConversationStageId, tenant_id: TenantId, members: Vec<MembershipId>) -> Self {
        Self {
            id,
            members,
            tenant_id,
        }
    }

    pub fn who_can(&self) -> Result<&[MembershipId], ConversationStageError> {
        if self.members.is_empty() {
            return Err(ConversationStageError::Incomplete);
        }
        if self.members.len() > CONVERSATION_STAGE_CAP {
            return Err(ConversationStageError::OverCap {
                observed: self.members.len(),
            });
        }
        Ok(&self.members)
    }
}
