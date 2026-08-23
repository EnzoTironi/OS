use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};

use crate::{
    DefinitelyNotSentReason, EffectAttemptId, EffectAttemptResult, EffectRequestDigest,
    EffectRequestId, EffectResponseDigest, ProviderOperationId, TimestampMicros,
    UnknownEffectReason,
};

pub const HUMAN_TASK_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HumanExecutorClass {
    HumanExecutor,
}

impl HumanExecutorClass {
    pub fn as_str(self) -> &'static str {
        "human_executor"
    }

    pub fn parse(value: &str) -> Result<Self, HumanTaskError> {
        match value {
            "human_executor" => Ok(Self::HumanExecutor),
            other => Err(HumanTaskError::InvalidExecutorClass(other.to_owned())),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DisclosureClass {
    Minimal,
    Standard,
}

impl DisclosureClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Minimal => "minimal",
            Self::Standard => "standard",
        }
    }

    pub fn parse(value: &str) -> Result<Self, HumanTaskError> {
        match value {
            "minimal" => Ok(Self::Minimal),
            "standard" => Ok(Self::Standard),
            other => Err(HumanTaskError::InvalidDisclosureClass(other.to_owned())),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReconciliationPolicy {
    RequiredIndependent,
    OperatorAttemptSufficient,
}

impl ReconciliationPolicy {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::RequiredIndependent => "required_independent",
            Self::OperatorAttemptSufficient => "operator_attempt_sufficient",
        }
    }

    pub fn parse(value: &str) -> Result<Self, HumanTaskError> {
        match value {
            "required_independent" => Ok(Self::RequiredIndependent),
            "operator_attempt_sufficient" => Ok(Self::OperatorAttemptSufficient),
            other => Err(HumanTaskError::InvalidReconciliationPolicy(
                other.to_owned(),
            )),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HumanInputValue {
    Text(String),
    Integer(i64),
    Boolean(bool),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HumanContactRef {
    pub name_ref: Option<String>,
    pub phone_ref: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HumanTaskBounds {
    pub max_expense_minor: Option<i64>,
    pub allowed_actions: Vec<String>,
    pub disclosure_class: DisclosureClass,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceFieldSpec {
    pub field_id: String,
    pub required: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HumanTaskContract {
    pub schema_version: u32,
    pub executor_class: HumanExecutorClass,
    pub instruction: String,
    pub structured_inputs: BTreeMap<String, HumanInputValue>,
    pub contact: Option<HumanContactRef>,
    pub bounds: HumanTaskBounds,
    pub expiry: TimestampMicros,
    pub required_evidence: Vec<EvidenceFieldSpec>,
    pub reconciliation: ReconciliationPolicy,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HumanTaskPacket {
    pub effect_request_id: EffectRequestId,
    pub attempt_id: EffectAttemptId,
    pub request_digest: EffectRequestDigest,
    pub instruction: String,
    pub structured_inputs: BTreeMap<String, HumanInputValue>,
    pub contact: Option<HumanContactRef>,
    pub bounds: HumanTaskBounds,
    pub expires_at: TimestampMicros,
    pub required_evidence: Vec<EvidenceFieldSpec>,
    pub reconciliation: ReconciliationPolicy,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArtifactRef {
    pub artifact_id: String,
    pub digest: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OperatorReport {
    Declined {
        reason: String,
    },
    Unable {
        reason: String,
    },
    Expired,
    ReportedFailure {
        artifacts: Vec<ArtifactRef>,
        notes: String,
    },
    ReportedSuccess {
        artifacts: Vec<ArtifactRef>,
        notes: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EffectPayloadKind {
    ExternalBytes,
    HumanTask,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HumanTaskError {
    DigestMismatch,
    Expired,
    ForbiddenField(String),
    InstructionEmpty,
    InstructionTooLong,
    InvalidDisclosureClass(String),
    InvalidExecutorClass(String),
    InvalidReconciliationPolicy(String),
    InvalidSchemaVersion(u32),
    Malformed(String),
}

impl Display for HumanTaskError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DigestMismatch => formatter.write_str("human task payload digest mismatch"),
            Self::Expired => formatter.write_str("human task is expired"),
            Self::ForbiddenField(field) => {
                write!(formatter, "human task forbids field {field}")
            }
            Self::InstructionEmpty => formatter.write_str("human task instruction is empty"),
            Self::InstructionTooLong => formatter.write_str("human task instruction is too long"),
            Self::InvalidDisclosureClass(value) => {
                write!(formatter, "invalid disclosure class {value}")
            }
            Self::InvalidExecutorClass(value) => {
                write!(formatter, "invalid human executor class {value}")
            }
            Self::InvalidReconciliationPolicy(value) => {
                write!(formatter, "invalid reconciliation policy {value}")
            }
            Self::InvalidSchemaVersion(version) => {
                write!(formatter, "unsupported human task schema version {version}")
            }
            Self::Malformed(message) => write!(formatter, "malformed human task: {message}"),
        }
    }
}

impl Error for HumanTaskError {}

pub const HUMAN_TASK_INSTRUCTION_MAX_CHARS: usize = 4_000;

const FORBIDDEN_INPUT_KEYS: &[&str] = &[
    "brain",
    "chat",
    "chat_transcript",
    "credential",
    "credentials",
    "database_url",
    "db_password",
    "password",
    "secret",
    "token",
];

pub fn validate_human_task_contract(contract: &HumanTaskContract) -> Result<(), HumanTaskError> {
    if contract.schema_version != HUMAN_TASK_SCHEMA_VERSION {
        return Err(HumanTaskError::InvalidSchemaVersion(
            contract.schema_version,
        ));
    }
    if !matches!(contract.executor_class, HumanExecutorClass::HumanExecutor) {
        return Err(HumanTaskError::InvalidExecutorClass(
            contract.executor_class.as_str().to_owned(),
        ));
    }
    if contract.instruction.trim().is_empty() {
        return Err(HumanTaskError::InstructionEmpty);
    }
    if contract.instruction.chars().count() > HUMAN_TASK_INSTRUCTION_MAX_CHARS {
        return Err(HumanTaskError::InstructionTooLong);
    }
    for key in contract.structured_inputs.keys() {
        let normalized = key.to_ascii_lowercase();
        if FORBIDDEN_INPUT_KEYS
            .iter()
            .any(|forbidden| normalized.contains(forbidden))
        {
            return Err(HumanTaskError::ForbiddenField(key.clone()));
        }
        if let HumanInputValue::Text(value) = &contract.structured_inputs[key] {
            reject_forbidden_blob(key, value)?;
        }
    }
    reject_forbidden_blob("instruction", &contract.instruction)?;
    Ok(())
}

fn reject_forbidden_blob(field: &str, value: &str) -> Result<(), HumanTaskError> {
    let lowered = value.to_ascii_lowercase();
    for needle in [
        "chat transcript",
        "database_url=",
        "postgres://",
        "postgresql://",
        "begin private key",
        "api_key=",
        "authorization: bearer",
    ] {
        if lowered.contains(needle) {
            return Err(HumanTaskError::ForbiddenField(field.to_owned()));
        }
    }
    Ok(())
}

/// Operator self-report never yields Confirmed / ConfirmedNoEffect.
pub fn map_operator_report(
    report: &OperatorReport,
    provider_operation_id: ProviderOperationId,
    response_digest: EffectResponseDigest,
) -> EffectAttemptResult {
    match report {
        OperatorReport::Declined { .. } | OperatorReport::Unable { .. } => {
            EffectAttemptResult::DefinitelyNotSent {
                reason: DefinitelyNotSentReason::CredentialRevoked,
            }
        }
        OperatorReport::Expired => EffectAttemptResult::DefinitelyNotSent {
            reason: DefinitelyNotSentReason::TimeoutBeforeSend,
        },
        OperatorReport::ReportedFailure { .. } => EffectAttemptResult::Unknown {
            provider_operation_id: Some(provider_operation_id),
            reason: UnknownEffectReason::ProviderUnavailable,
            response_digest: Some(response_digest),
        },
        OperatorReport::ReportedSuccess { .. } => EffectAttemptResult::AcceptedPending {
            provider_operation_id,
            response_digest,
        },
    }
}

pub fn project_human_task_packet_from_contract(
    effect_request_id: EffectRequestId,
    attempt_id: EffectAttemptId,
    request_digest: EffectRequestDigest,
    contract: &HumanTaskContract,
    now: TimestampMicros,
) -> Result<HumanTaskPacket, HumanTaskError> {
    validate_human_task_contract(contract)?;
    if now.get() > contract.expiry.get() {
        return Err(HumanTaskError::Expired);
    }
    Ok(HumanTaskPacket {
        effect_request_id,
        attempt_id,
        request_digest,
        instruction: contract.instruction.clone(),
        structured_inputs: contract.structured_inputs.clone(),
        contact: contract.contact.clone(),
        bounds: contract.bounds.clone(),
        expires_at: contract.expiry,
        required_evidence: contract.required_evidence.clone(),
        reconciliation: contract.reconciliation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EffectResponseDigest, ProviderOperationId};

    fn sample_contract() -> HumanTaskContract {
        HumanTaskContract {
            schema_version: HUMAN_TASK_SCHEMA_VERSION,
            executor_class: HumanExecutorClass::HumanExecutor,
            instruction: "Collect wet signature".to_owned(),
            structured_inputs: BTreeMap::new(),
            contact: None,
            bounds: HumanTaskBounds {
                max_expense_minor: Some(0),
                allowed_actions: vec!["collect_signature".to_owned()],
                disclosure_class: DisclosureClass::Minimal,
            },
            expiry: TimestampMicros::new(9_000_000_000_000_000),
            required_evidence: vec![EvidenceFieldSpec {
                field_id: "signed_form".to_owned(),
                required: true,
            }],
            reconciliation: ReconciliationPolicy::RequiredIndependent,
        }
    }

    #[test]
    fn reported_success_is_accepted_pending_never_confirmed() {
        let digest = EffectResponseDigest::parse(
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        )
        .expect("digest");
        let provider = ProviderOperationId::parse("provider.human.1").expect("provider");
        let result = map_operator_report(
            &OperatorReport::ReportedSuccess {
                artifacts: Vec::new(),
                notes: "done".to_owned(),
            },
            provider,
            digest,
        );
        assert!(matches!(
            result,
            EffectAttemptResult::AcceptedPending { .. }
        ));
        assert!(!matches!(
            result,
            EffectAttemptResult::Confirmed { .. } | EffectAttemptResult::ConfirmedNoEffect { .. }
        ));
    }

    #[test]
    fn forbidden_credential_blob_is_rejected() {
        let mut contract = sample_contract();
        contract.instruction = "use postgres://user:pass@db".to_owned();
        assert!(matches!(
            validate_human_task_contract(&contract),
            Err(HumanTaskError::ForbiddenField(_))
        ));
    }
}
