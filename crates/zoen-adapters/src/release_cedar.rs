//! Release-scoped Cedar authority: active `PolicyCatalog` wins over boot manifest.

use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    fmt::{Display, Formatter},
    sync::{Arc, RwLock},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zoen_core::{
    ActionId, ActorId, BudgetClass, BudgetClassCatalog, BudgetClassId, BudgetClassSpec, Clearance,
    DefinitionDigest, DefinitionId, DefinitionReference, DefinitionRevisionNumber, DelegationChain,
    DelegationGrant, DelegationId, Membership, MembershipId, PolicyCatalogDigest, PolicyDigest,
    PolicyEvaluation, PolicyId, PolicyRevisionNumber, PrincipalId, PublicVerb, ReleaseDigest,
    ResourceId, TimestampMicros, TrustedExecutionContext, WORLD_KERNEL_AUTHORITY_DEFINITION,
    WORLD_KERNEL_AUTHORITY_DEFINITION_DIGEST, WorkloadId, WorldId, trusted_context_from_membership,
};
use zoen_engine::{
    ComputationLimits, PolicyEvaluator, PolicyOperation, PolicyRequest, directory_projection,
};

use crate::{
    CedarConfigError, CedarPolicyEvaluator, PostgresWorldReleaseStore,
    cedar::budget_classes_from_policy_catalog,
};

/// Evaluates governed verbs from the World's active `PolicyCatalog`.
///
/// Boot-manifest Cedar (`ZOEN_CEDAR_POLICY_MANIFEST`) applies only while the World
/// has no active release (bootstrap). After activation, evaluation uses catalog
/// bytes bound by that release's `ReleaseDigest` and fails closed when the
/// catalog lacks a loadable Cedar bundle — never falling back to the boot file.
pub struct ReleaseCedarEvaluator {
    boot: Arc<CedarPolicyEvaluator>,
    cache: RwLock<BTreeMap<String, Arc<CedarPolicyEvaluator>>>,
    store: PostgresWorldReleaseStore,
}

/// Durable explanation of the exact authority and release-selected limits used
/// for one computation. It cannot authorize execution by itself.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComputeBasisEvidence {
    canonical_jcs: String,
    digest: String,
    document: ComputeBasisDocument,
}

impl ComputeBasisEvidence {
    #[must_use]
    pub fn approved(&self) -> bool {
        self.document.approved
    }

    #[must_use]
    pub fn action_id(&self) -> &str {
        &self.document.action_id
    }

    #[must_use]
    pub fn actor_id(&self) -> &str {
        &self.document.actor_id
    }

    #[must_use]
    pub fn authorized_at_micros(&self) -> i64 {
        self.document.authorized_at_micros
    }

    #[must_use]
    pub fn budget_class_id(&self) -> &str {
        &self.document.budget_class.id
    }

    #[must_use]
    pub fn budget_priority(&self) -> u32 {
        self.document.budget_class.priority
    }

    #[must_use]
    pub fn budget_resource_id(&self) -> &str {
        &self.document.budget_class.resource_id
    }

    #[must_use]
    pub fn canonical_jcs(&self) -> &str {
        &self.canonical_jcs
    }

    #[must_use]
    pub fn determining_policies(&self) -> &[String] {
        &self.document.policy.determining_policies
    }

    #[must_use]
    pub fn digest(&self) -> &str {
        &self.digest
    }

    #[must_use]
    pub fn membership_id(&self) -> &str {
        &self.document.membership_id
    }

    #[must_use]
    pub fn operation(&self) -> &str {
        &self.document.operation
    }

    #[must_use]
    pub fn policy_catalog_digest(&self) -> &str {
        &self.document.policy_catalog_digest
    }

    #[must_use]
    pub fn policy_digest(&self) -> &str {
        &self.document.policy.digest
    }

    #[must_use]
    pub fn policy_id(&self) -> &str {
        &self.document.policy.id
    }

    #[must_use]
    pub fn policy_revision(&self) -> u64 {
        self.document.policy.revision
    }

    #[must_use]
    pub fn principal_id(&self) -> &str {
        &self.document.principal_id
    }

    #[must_use]
    pub fn release_digest(&self) -> &str {
        &self.document.release_digest
    }

    #[must_use]
    pub fn workload_id(&self) -> &str {
        &self.document.workload_id
    }

    pub(crate) fn world_id(&self) -> &str {
        &self.document.world_id
    }

    /// Reconstruct stored evidence only after checking that it is canonical and
    /// internally complete.
    pub(crate) fn from_canonical_jcs(value: &str) -> Result<Self, ComputeBasisError> {
        let document = serde_json::from_str::<ComputeBasisDocument>(value)
            .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))?;
        if document.schema != COMPUTE_BASIS_SCHEMA {
            return Err(ComputeBasisError::InvalidStored(format!(
                "expected schema {COMPUTE_BASIS_SCHEMA}, got {}",
                document.schema
            )));
        }
        validate_compute_basis_document(&document)?;
        let canonical = serde_jcs::to_string(&document)
            .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))?;
        if canonical != value {
            return Err(ComputeBasisError::InvalidStored(
                "stored compute basis is not canonical JSON".to_owned(),
            ));
        }
        Ok(Self {
            digest: zoen_core::encode_hex(&Sha256::digest(canonical.as_bytes())),
            canonical_jcs: canonical,
            document,
        })
    }

    pub(crate) fn limits(&self) -> Result<ComputationLimits, ComputeBasisError> {
        let budget = &self.document.budget_class;
        ComputationLimits::new(
            budget.fuel,
            usize::try_from(budget.memory_bytes)
                .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))?,
            usize::try_from(budget.table_elements)
                .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))?,
            usize::try_from(budget.instances)
                .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))?,
            usize::try_from(budget.tables)
                .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))?,
            usize::try_from(budget.memories)
                .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))?,
            budget.deadline_millis,
        )
        .map_err(|error| ComputeBasisError::InvalidStored(error.to_string()))
    }
}

/// Opaque, move-only proof that one Active Membership was authorized against a
/// single active `WorldRelease` snapshot. Only [`ReleaseCedarEvaluator`] can mint it.
pub struct ResolvedComputeBasis {
    context: TrustedExecutionContext,
    evaluator: Arc<CedarPolicyEvaluator>,
    evidence: ComputeBasisEvidence,
    limits: ComputationLimits,
}

impl ResolvedComputeBasis {
    #[must_use]
    pub fn context(&self) -> &TrustedExecutionContext {
        &self.context
    }

    #[must_use]
    pub fn evidence(&self) -> &ComputeBasisEvidence {
        &self.evidence
    }

    #[must_use]
    pub fn limits(&self) -> ComputationLimits {
        self.limits
    }

    #[must_use]
    pub fn pinned_evaluator(&self) -> Arc<CedarPolicyEvaluator> {
        self.evaluator.clone()
    }

    pub(crate) fn into_parts(
        self,
    ) -> (
        TrustedExecutionContext,
        ComputeBasisEvidence,
        ComputationLimits,
    ) {
        (self.context, self.evidence, self.limits)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComputeBasisError {
    Denied,
    InvalidCatalog(String),
    InvalidIdentity(String),
    InvalidStored(String),
    PolicyEvaluation(String),
    Store(String),
}

impl Display for ComputeBasisError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Denied => {
                formatter.write_str("Membership is not authorized for any compute budget")
            }
            Self::InvalidCatalog(message) => {
                write!(formatter, "invalid compute catalog: {message}")
            }
            Self::InvalidIdentity(message) => {
                write!(formatter, "invalid compute identity: {message}")
            }
            Self::InvalidStored(message) => {
                write!(formatter, "invalid stored compute basis: {message}")
            }
            Self::PolicyEvaluation(message) => {
                write!(formatter, "compute policy evaluation failed: {message}")
            }
            Self::Store(message) => {
                write!(formatter, "compute authority store unavailable: {message}")
            }
        }
    }
}

impl Error for ComputeBasisError {}

const COMPUTE_BASIS_SCHEMA: &str = "zoen.compute-basis.v1";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComputeBasisDocument {
    action_id: String,
    actor_id: String,
    approved: bool,
    authority_definition: AuthorityDefinitionDocument,
    authorized_at_micros: i64,
    budget_class: BudgetClassDocument,
    clearance: Vec<String>,
    delegation: Vec<DelegationGrantDocument>,
    membership_id: String,
    membership_status: String,
    operation: String,
    policy: PolicyDocument,
    policy_catalog_digest: String,
    principal_id: String,
    release_digest: String,
    schema: String,
    workload_id: String,
    world_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorityDefinitionDocument {
    definition_id: String,
    digest: String,
    revision: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BudgetClassDocument {
    deadline_millis: u64,
    fuel: u64,
    id: String,
    instances: u64,
    memories: u64,
    memory_bytes: u64,
    priority: u32,
    resource_id: String,
    table_elements: u64,
    tables: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DelegationGrantDocument {
    actions: Vec<String>,
    expires_at_micros: i64,
    id: String,
    not_before_micros: i64,
    resources: Vec<String>,
    workloads: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PolicyDocument {
    determining_policies: Vec<String>,
    digest: String,
    id: String,
    revision: u64,
}

fn validate_compute_basis_document(
    document: &ComputeBasisDocument,
) -> Result<(), ComputeBasisError> {
    let invalid = |message: String| ComputeBasisError::InvalidStored(message);
    if document.membership_status != "active" {
        return Err(invalid("compute basis Membership is not Active".to_owned()));
    }
    if document.action_id != PublicVerb::Execute.action_id()
        || document.operation != "execute"
        || !document.approved
    {
        return Err(invalid(
            "compute basis must describe an approved Execute operation".to_owned(),
        ));
    }
    if document.authority_definition.definition_id != WORLD_KERNEL_AUTHORITY_DEFINITION
        || document.authority_definition.digest != WORLD_KERNEL_AUTHORITY_DEFINITION_DIGEST
        || document.authority_definition.revision != 1
    {
        return Err(invalid(
            "compute basis has an unknown authority definition".to_owned(),
        ));
    }
    MembershipId::parse(&document.membership_id).map_err(|error| invalid(error.to_string()))?;
    ActorId::parse(&document.actor_id).map_err(|error| invalid(error.to_string()))?;
    PrincipalId::parse(&document.principal_id).map_err(|error| invalid(error.to_string()))?;
    let workload =
        WorkloadId::parse(&document.workload_id).map_err(|error| invalid(error.to_string()))?;
    WorldId::parse(&document.world_id).map_err(|error| invalid(error.to_string()))?;
    ReleaseDigest::parse(&document.release_digest).map_err(|error| invalid(error.to_string()))?;
    PolicyCatalogDigest::parse(&document.policy_catalog_digest)
        .map_err(|error| invalid(error.to_string()))?;
    PolicyId::parse(&document.policy.id).map_err(|error| invalid(error.to_string()))?;
    PolicyDigest::parse(&document.policy.digest).map_err(|error| invalid(error.to_string()))?;
    PolicyRevisionNumber::new(document.policy.revision)
        .ok_or_else(|| invalid("compute policy revision is zero".to_owned()))?;
    if document.policy.determining_policies.is_empty()
        || !strictly_sorted(&document.policy.determining_policies)
    {
        return Err(invalid(
            "compute determining policies must be nonempty, sorted, and unique".to_owned(),
        ));
    }
    Clearance::from_token_strings(document.clearance.iter().cloned())
        .map_err(|error| invalid(error.to_string()))?;
    if !strictly_sorted(&document.clearance) {
        return Err(invalid(
            "compute clearance must be sorted and unique".to_owned(),
        ));
    }
    let action =
        ActionId::parse(&document.action_id).map_err(|error| invalid(error.to_string()))?;
    let resource = ResourceId::parse(&document.budget_class.resource_id)
        .map_err(|error| invalid(error.to_string()))?;
    let budget_id = BudgetClassId::parse(&document.budget_class.id)
        .map_err(|error| invalid(error.to_string()))?;
    let budget = &document.budget_class;
    BudgetClass::new(BudgetClassSpec {
        deadline_millis: budget.deadline_millis,
        fuel: budget.fuel,
        id: budget_id,
        instances: usize::try_from(budget.instances).map_err(|error| invalid(error.to_string()))?,
        memories: usize::try_from(budget.memories).map_err(|error| invalid(error.to_string()))?,
        memory_bytes: usize::try_from(budget.memory_bytes)
            .map_err(|error| invalid(error.to_string()))?,
        priority: budget.priority,
        resource_id: resource.clone(),
        table_elements: usize::try_from(budget.table_elements)
            .map_err(|error| invalid(error.to_string()))?,
        tables: usize::try_from(budget.tables).map_err(|error| invalid(error.to_string()))?,
    })
    .map_err(|error| invalid(error.to_string()))?;
    let grants = document
        .delegation
        .iter()
        .map(|grant| delegation_grant_from_document(grant, &invalid))
        .collect::<Result<Vec<_>, _>>()?;
    let delegation = DelegationChain::new(grants).map_err(|error| invalid(error.to_string()))?;
    if !delegation.permits(
        &action,
        &resource,
        &workload,
        TimestampMicros::new(document.authorized_at_micros),
    ) {
        return Err(invalid(
            "compute basis terminal delegation does not permit its selection".to_owned(),
        ));
    }
    Ok(())
}

fn delegation_grant_from_document(
    document: &DelegationGrantDocument,
    invalid: &impl Fn(String) -> ComputeBasisError,
) -> Result<DelegationGrant, ComputeBasisError> {
    if !strictly_sorted(&document.actions)
        || !strictly_sorted(&document.resources)
        || !strictly_sorted(&document.workloads)
    {
        return Err(invalid(
            "compute delegation scopes must be sorted and unique".to_owned(),
        ));
    }
    let actions = document
        .actions
        .iter()
        .map(ActionId::parse)
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(|error| invalid(error.to_string()))?;
    let resources = document
        .resources
        .iter()
        .map(ResourceId::parse)
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(|error| invalid(error.to_string()))?;
    let workloads = document
        .workloads
        .iter()
        .map(WorkloadId::parse)
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(|error| invalid(error.to_string()))?;
    DelegationGrant::new(
        DelegationId::parse(&document.id).map_err(|error| invalid(error.to_string()))?,
        actions,
        resources,
        workloads,
        TimestampMicros::new(document.not_before_micros),
        TimestampMicros::new(document.expires_at_micros),
    )
    .map_err(|error| invalid(error.to_string()))
}

fn strictly_sorted(values: &[String]) -> bool {
    values.windows(2).all(|pair| pair[0] < pair[1])
}

impl ReleaseCedarEvaluator {
    #[must_use]
    pub fn new(boot: CedarPolicyEvaluator, store: PostgresWorldReleaseStore) -> Self {
        Self {
            boot: Arc::new(boot),
            cache: RwLock::new(BTreeMap::new()),
            store,
        }
    }

    #[must_use]
    pub fn boot(&self) -> &CedarPolicyEvaluator {
        &self.boot
    }

    /// Load and compile Cedar from the active release for `world`.
    ///
    /// # Errors
    ///
    /// Returns an error when the World has no active release, catalogs are
    /// missing, or the `PolicyCatalog` cannot compile as Cedar.
    pub async fn evaluator_for_active_world(
        &self,
        world: &WorldId,
    ) -> Result<(ReleaseDigest, Arc<CedarPolicyEvaluator>), String> {
        let digest = self
            .store
            .get_active(world)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "world has no active release".to_owned())?;
        let evaluator = self.evaluator_for_release(&digest).await?;
        Ok((digest, evaluator))
    }

    /// Resolve the only server-selected compute budget this Active Membership
    /// may use, against one immutable active-release snapshot.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeBasisError::Denied`] when neither terminal delegation
    /// nor Cedar permits any published class. Catalog, identity, policy, and
    /// store failures fail closed without a bootstrap fallback.
    pub async fn resolve_compute_basis(
        &self,
        membership: Membership,
        authorized_at: TimestampMicros,
    ) -> Result<ResolvedComputeBasis, ComputeBasisError> {
        let context = trusted_context_from_membership(&membership)
            .map_err(|error| ComputeBasisError::InvalidIdentity(error.to_string()))?;
        let world = membership.world_id.clone();
        let release_digest = self
            .store
            .get_active(&world)
            .await
            .map_err(|error| ComputeBasisError::Store(error.to_string()))?
            .ok_or_else(|| {
                ComputeBasisError::InvalidCatalog("world has no active release".to_owned())
            })?;
        let catalogs = self
            .store
            .get_catalogs(&release_digest)
            .await
            .map_err(|error| ComputeBasisError::Store(error.to_string()))?
            .ok_or_else(|| {
                ComputeBasisError::InvalidCatalog(
                    "active release catalogs were not found".to_owned(),
                )
            })?;
        let classes = budget_classes_from_policy_catalog(catalogs.policy().bytes())
            .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?;
        let evaluator = self
            .evaluator_for_snapshot(&release_digest, catalogs.policy().bytes())
            .map_err(ComputeBasisError::InvalidCatalog)?;
        let action_id = ActionId::parse(PublicVerb::Execute.action_id())
            .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?;
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse(WORLD_KERNEL_AUTHORITY_DEFINITION)
                .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?,
            digest: DefinitionDigest::parse(WORLD_KERNEL_AUTHORITY_DEFINITION_DIGEST)
                .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?,
            revision: DefinitionRevisionNumber::new(1).ok_or_else(|| {
                ComputeBasisError::InvalidCatalog(
                    "compute authority definition revision is zero".to_owned(),
                )
            })?,
        };
        let inputs = [];
        for class in classes.selection_order() {
            if !context.delegation().permits(
                &action_id,
                class.resource_id(),
                context.workload_id(),
                authorized_at,
            ) {
                continue;
            }
            let projection = directory_projection(&context, class.resource_id())
                .map_err(ComputeBasisError::InvalidCatalog)?;
            let evaluation = evaluator.evaluate_request(&PolicyRequest {
                action_id: &action_id,
                approved: true,
                classification: None,
                context: &context,
                definition: &definition,
                inputs: &inputs,
                operation: PolicyOperation::Execute,
                projection: Some(&projection),
                resource_id: class.resource_id(),
                written_classification: None,
            });
            let policy = match evaluation {
                PolicyEvaluation::Permit(evidence) => evidence,
                PolicyEvaluation::Deny(_) => continue,
                PolicyEvaluation::EvaluationError { message, .. } => {
                    return Err(ComputeBasisError::PolicyEvaluation(message));
                }
            };
            let limits = ComputationLimits::from_budget_class(class);
            let evidence = compute_basis_evidence(ComputeBasisInput {
                action_id: &action_id,
                authorized_at,
                class,
                definition: &definition,
                membership: &membership,
                policy,
                policy_catalog_digest: catalogs.policy().digest(),
                release_digest: &release_digest,
                world: &world,
            })?;
            return Ok(ResolvedComputeBasis {
                context,
                evaluator,
                evidence,
                limits,
            });
        }
        Err(ComputeBasisError::Denied)
    }

    /// List budget classes published on the World's active `PolicyCatalog`.
    ///
    /// # Errors
    ///
    /// Returns an error when the World has no active release or budgets cannot load.
    pub async fn budget_catalog_for_active_world(
        &self,
        world: &WorldId,
    ) -> Result<(ReleaseDigest, BudgetClassCatalog), String> {
        let digest = self
            .store
            .get_active(world)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "world has no active release".to_owned())?;
        let catalogs = self
            .store
            .get_catalogs(&digest)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "active release catalogs were not found".to_owned())?;
        let catalog = budget_classes_from_policy_catalog(catalogs.policy().bytes())
            .map_err(|error| error.to_string())?;
        Ok((digest, catalog))
    }

    async fn evaluator_for_release(
        &self,
        digest: &ReleaseDigest,
    ) -> Result<Arc<CedarPolicyEvaluator>, String> {
        if let Some(cached) = self
            .cache
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(digest.as_str())
            .cloned()
        {
            return Ok(cached);
        }
        let catalogs = self
            .store
            .get_catalogs(digest)
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "active release catalogs were not found".to_owned())?;
        self.evaluator_for_snapshot(digest, catalogs.policy().bytes())
    }

    fn evaluator_for_snapshot(
        &self,
        digest: &ReleaseDigest,
        policy_catalog: &[u8],
    ) -> Result<Arc<CedarPolicyEvaluator>, String> {
        if let Some(cached) = self
            .cache
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(digest.as_str())
            .cloned()
        {
            return Ok(cached);
        }
        let compiled = CedarPolicyEvaluator::from_policy_catalog_bytes(policy_catalog)
            .map_err(|error| error.to_string())?;
        if compiled.is_empty() {
            return Err("active release PolicyCatalog has no Cedar policies".to_owned());
        }
        let compiled = Arc::new(compiled);
        self.cache
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(digest.as_str().to_owned(), compiled.clone());
        Ok(compiled)
    }
}

struct ComputeBasisInput<'a> {
    action_id: &'a ActionId,
    authorized_at: TimestampMicros,
    class: &'a BudgetClass,
    definition: &'a DefinitionReference,
    membership: &'a Membership,
    policy: zoen_core::PolicyEvidence,
    policy_catalog_digest: &'a PolicyCatalogDigest,
    release_digest: &'a ReleaseDigest,
    world: &'a WorldId,
}

fn compute_basis_evidence(
    input: ComputeBasisInput<'_>,
) -> Result<ComputeBasisEvidence, ComputeBasisError> {
    let ComputeBasisInput {
        action_id,
        authorized_at,
        class,
        definition,
        membership,
        policy,
        policy_catalog_digest,
        release_digest,
        world,
    } = input;
    let budget_class = BudgetClassDocument {
        deadline_millis: class.deadline_millis(),
        fuel: class.fuel(),
        id: class.id().as_str().to_owned(),
        instances: u64::try_from(class.instances())
            .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?,
        memories: u64::try_from(class.memories())
            .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?,
        memory_bytes: u64::try_from(class.memory_bytes())
            .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?,
        priority: class.priority(),
        resource_id: class.resource_id().as_str().to_owned(),
        table_elements: u64::try_from(class.table_elements())
            .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?,
        tables: u64::try_from(class.tables())
            .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?,
    };
    let delegation = membership
        .delegation
        .grants()
        .iter()
        .map(|grant| DelegationGrantDocument {
            actions: grant
                .actions()
                .iter()
                .map(|value| value.as_str().to_owned())
                .collect(),
            expires_at_micros: grant.expires_at().get(),
            id: grant.id().as_str().to_owned(),
            not_before_micros: grant.not_before().get(),
            resources: grant
                .resources()
                .iter()
                .map(|value| value.as_str().to_owned())
                .collect(),
            workloads: grant
                .workloads()
                .iter()
                .map(|value| value.as_str().to_owned())
                .collect(),
        })
        .collect();
    let document = ComputeBasisDocument {
        action_id: action_id.as_str().to_owned(),
        actor_id: membership.actor_id.as_str().to_owned(),
        approved: true,
        authority_definition: AuthorityDefinitionDocument {
            definition_id: definition.definition_id.as_str().to_owned(),
            digest: definition.digest.as_str().to_owned(),
            revision: definition.revision.get(),
        },
        authorized_at_micros: authorized_at.get(),
        budget_class,
        clearance: membership
            .clearance
            .tokens()
            .iter()
            .map(|value| value.as_str().to_owned())
            .collect(),
        delegation,
        membership_id: membership.id.as_str().to_owned(),
        membership_status: "active".to_owned(),
        operation: "execute".to_owned(),
        policy: PolicyDocument {
            determining_policies: policy.determining_policies,
            digest: policy.revision.digest.as_str().to_owned(),
            id: policy.revision.id.as_str().to_owned(),
            revision: policy.revision.revision.get(),
        },
        policy_catalog_digest: policy_catalog_digest.as_str().to_owned(),
        principal_id: membership.principal_id.as_str().to_owned(),
        release_digest: release_digest.as_str().to_owned(),
        schema: COMPUTE_BASIS_SCHEMA.to_owned(),
        workload_id: membership.workload_id.as_str().to_owned(),
        world_id: world.as_str().to_owned(),
    };
    let canonical_jcs = serde_jcs::to_string(&document)
        .map_err(|error| ComputeBasisError::InvalidCatalog(error.to_string()))?;
    let digest = zoen_core::encode_hex(&Sha256::digest(canonical_jcs.as_bytes()));
    Ok(ComputeBasisEvidence {
        canonical_jcs,
        digest,
        document,
    })
}

impl PolicyEvaluator for ReleaseCedarEvaluator {
    async fn evaluate(&self, request: &PolicyRequest<'_>) -> PolicyEvaluation {
        let Ok(world) = WorldId::parse(request.context.world_id().as_str()) else {
            return self.boot.evaluate(request).await;
        };
        match self.store.get_active(&world).await {
            Ok(None) => self.boot.evaluate(request).await,
            Ok(Some(digest)) => match self.evaluator_for_release(&digest).await {
                Ok(evaluator) => evaluator.evaluate_request(request),
                Err(message) => PolicyEvaluation::EvaluationError {
                    message: format!(
                        "active-release Cedar unavailable for {}: {message}",
                        digest.as_str()
                    ),
                    revision: None,
                },
            },
            Err(error) => PolicyEvaluation::EvaluationError {
                message: format!("active-release Cedar lookup failed: {error}"),
                revision: None,
            },
        }
    }
}

/// Validate `PolicyCatalog` candidate bytes before publish.
///
/// # Errors
///
/// Returns [`CedarConfigError`] when bytes are not a loadable §8.4 Cedar catalog.
pub fn require_loadable_policy_catalog(
    bytes: &[u8],
) -> Result<CedarPolicyEvaluator, CedarConfigError> {
    let evaluator = CedarPolicyEvaluator::from_policy_catalog_bytes(bytes)?;
    if evaluator.is_empty() {
        return Err(CedarConfigError::Invalid(
            "authorization.policies must contain at least one Cedar policy".to_owned(),
        ));
    }
    // Fail closed on malformed computeBudgets so releases cannot publish
    // unusable BudgetClass entries (W2-07).
    budget_classes_from_policy_catalog(bytes)?;
    Ok(evaluator)
}
