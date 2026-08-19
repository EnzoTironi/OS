#[cfg(feature = "failpoints")]
use std::env;
#[cfg(feature = "failpoints")]
use std::time::Duration;

#[cfg(feature = "failpoints")]
use tokio::time::sleep;
use zoen_engine::StoreError;

#[derive(Clone, Copy)]
pub(super) enum CommitStage {
    AfterCommit,
    AfterEffectRequests,
    AfterLock,
    AfterOperationInsert,
    AfterSemanticRecords,
    BeforeCommit,
    BeforeHeadAdvance,
    BeforeLock,
}

#[cfg(feature = "failpoints")]
impl CommitStage {
    fn name(self) -> &'static str {
        match self {
            Self::AfterCommit => "after_commit",
            Self::AfterEffectRequests => "after_effect_requests",
            Self::AfterLock => "after_lock",
            Self::AfterOperationInsert => "after_operation_insert",
            Self::AfterSemanticRecords => "after_semantic_records",
            Self::BeforeCommit => "before_commit",
            Self::BeforeHeadAdvance => "before_head_advance",
            Self::BeforeLock => "before_lock",
        }
    }
}

#[cfg(feature = "failpoints")]
pub(super) async fn reach(stage: CommitStage) -> Result<(), StoreError> {
    if env::var("ZOEN_ACTION_COMMIT_FAILPOINT").as_deref() != Ok(stage.name()) {
        return Ok(());
    }
    if let Some(milliseconds) = env::var("ZOEN_ACTION_COMMIT_FAILPOINT_PAUSE_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
    {
        sleep(Duration::from_millis(milliseconds)).await;
        Ok(())
    } else {
        Err(StoreError::Unavailable(format!(
            "injected Action commit failure at {}",
            stage.name()
        )))
    }
}

#[cfg(not(feature = "failpoints"))]
pub(super) async fn reach(_: CommitStage) -> Result<(), StoreError> {
    Ok(())
}
