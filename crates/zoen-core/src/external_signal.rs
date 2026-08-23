use crate::identity::{
    AudienceClass, DurableEventId, ExternalSignalId, SourceClass, WorkloadCredentialId,
};
use crate::{PrincipalId, TenantId, TimestampMicros, WorkloadId};

/// Programmatic/event ingress record. Not human speech. Not accepted world state.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalSignal {
    pub id: ExternalSignalId,
    pub durable_event_id: DurableEventId,
    pub source: SignalSourceIdentity,
    pub payload_digest_ref: DigestRef,
    pub source_digest_ref: DigestRef,
    pub received_at: TimestampMicros,
    pub workload_credential_id: WorkloadCredentialId,
    pub tenant_id: TenantId,
    pub workload_id: WorkloadId,
    pub principal_id: PrincipalId,
    pub trust_disposition: SignalTrustDisposition,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignalSourceIdentity {
    pub class: SourceClass,
    pub external_id: String,
    pub audience_class: Option<AudienceClass>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DigestRef(String);

impl DigestRef {
    pub fn parse(value: impl Into<String>) -> Result<Self, ExternalSignalError> {
        let value = value.into();
        if !value.starts_with("sha256:") || value.len() != 71 {
            return Err(ExternalSignalError::InvalidDigestRef);
        }
        let hex = &value[7..];
        if !hex
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(ExternalSignalError::InvalidDigestRef);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SignalTrustDisposition {
    AttentionCandidate,
    EvidenceCandidate,
    UntrustedRaw,
}

impl SignalTrustDisposition {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AttentionCandidate => "attention_candidate",
            Self::EvidenceCandidate => "evidence_candidate",
            Self::UntrustedRaw => "untrusted_raw",
        }
    }

    pub fn parse(value: &str) -> Result<Self, ExternalSignalError> {
        match value {
            "attention_candidate" => Ok(Self::AttentionCandidate),
            "evidence_candidate" => Ok(Self::EvidenceCandidate),
            "untrusted_raw" => Ok(Self::UntrustedRaw),
            _ => Err(ExternalSignalError::InvalidTrustDisposition),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalSignalDraft {
    pub durable_event_id: DurableEventId,
    pub source: SignalSourceIdentity,
    pub payload_digest_ref: DigestRef,
    pub source_digest_ref: DigestRef,
    pub trust_disposition: SignalTrustDisposition,
}

/// Promotion seam: ExternalSignal → evidence candidate only when disposition allows.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceCandidateOffer {
    pub signal_id: ExternalSignalId,
    pub tenant_id: TenantId,
    pub payload_digest_ref: DigestRef,
    pub source_digest_ref: DigestRef,
    pub workload_credential_id: WorkloadCredentialId,
}

pub fn offer_external_signal_as_evidence_candidate(
    signal: &ExternalSignal,
) -> Result<EvidenceCandidateOffer, ExternalSignalError> {
    match signal.trust_disposition {
        SignalTrustDisposition::EvidenceCandidate => Ok(EvidenceCandidateOffer {
            signal_id: signal.id.clone(),
            tenant_id: signal.tenant_id.clone(),
            payload_digest_ref: signal.payload_digest_ref.clone(),
            source_digest_ref: signal.source_digest_ref.clone(),
            workload_credential_id: signal.workload_credential_id.clone(),
        }),
        SignalTrustDisposition::AttentionCandidate | SignalTrustDisposition::UntrustedRaw => {
            Err(ExternalSignalError::NotEvidenceCandidate)
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExternalSignalError {
    InvalidDigestRef,
    InvalidTrustDisposition,
    NotEvidenceCandidate,
}

impl std::fmt::Display for ExternalSignalError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidDigestRef => formatter.write_str("invalid digest ref"),
            Self::InvalidTrustDisposition => formatter.write_str("invalid trust disposition"),
            Self::NotEvidenceCandidate => {
                formatter.write_str("signal is not an evidence candidate")
            }
        }
    }
}

impl std::error::Error for ExternalSignalError {}
