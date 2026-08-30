use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use zoen_core::{
    AttributionEventKind, CatalogEntry, CreatorAttributionDigestRow, CreatorAttributionSummary,
    DefinitionDigest, DefinitionId, ObjectSource, ObjectStoreConflictReason, ObjectStorePutResult,
    OpenResult, PACK_FORMAT_V1, PackDigest, PackError, PackId, PackObject, PackObjectOntology,
    PackPresentation, PackVersion, PackVisibility, PublicKeyId, PublisherId, PublisherKey,
    PublisherKeyStatus, ReferralId, ShareInstallPolicy, ShareResolve, ShareToken,
    SignatureEvidence, TimestampMicros,
};

use crate::pack_store::admit_pack;

#[derive(Clone)]
pub struct PostgresPackRegistryStore {
    pool: PgPool,
}

#[derive(Clone, Debug)]
pub struct PutObjectInput {
    pub manifest_jcs: String,
    pub ontology_artifacts: Vec<(DefinitionId, DefinitionDigest, String)>,
    pub signature: SignatureEvidence,
    pub visibility: PackVisibility,
    pub categories: Vec<String>,
    pub outcome_label: String,
    pub stored_by: String,
}

#[derive(Clone, Debug)]
pub struct RecordAttributionInput<'a> {
    pub kind: AttributionEventKind,
    pub pack_digest: &'a PackDigest,
    pub publisher_id: &'a PublisherId,
    pub referral_id: &'a ReferralId,
    pub share_token: Option<&'a str>,
    pub tenant_id: Option<&'a str>,
    pub idempotency_key: &'a str,
}

impl PostgresPackRegistryStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn public_registry_enabled(&self) -> Result<bool, PackError> {
        let row = sqlx::query(
            "SELECT public_registry_enabled FROM pack_registry_config WHERE config_id = 'default'",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(store)?;
        row.try_get::<bool, _>("public_registry_enabled")
            .map_err(store)
    }

    pub async fn set_public_registry_enabled(&self, enabled: bool) -> Result<(), PackError> {
        sqlx::query(
            "UPDATE pack_registry_config
             SET public_registry_enabled = $1
             WHERE config_id = 'default'",
        )
        .bind(enabled)
        .execute(&self.pool)
        .await
        .map_err(store)?;
        Ok(())
    }

    pub async fn register_publisher_key(&self, key: &PublisherKey) -> Result<(), PackError> {
        if key.algorithm != "ed25519" {
            return Err(PackError::InvalidFormat(key.algorithm.clone()));
        }
        sqlx::query(
            "INSERT INTO pack_publisher_keys (
                public_key_id, publisher_id, algorithm, public_key_pem,
                status, valid_from, valid_to
             ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6::double precision / 1000000.0),
                       CASE WHEN $7::bigint IS NULL THEN NULL
                            ELSE to_timestamp($7::double precision / 1000000.0) END)
             ON CONFLICT (public_key_id) DO NOTHING",
        )
        .bind(key.public_key_id.as_str())
        .bind(key.publisher_id.as_str())
        .bind(&key.algorithm)
        .bind(&key.public_key_pem)
        .bind(key.status.as_str())
        .bind(key.valid_from.get())
        .bind(key.valid_to.map(TimestampMicros::get))
        .execute(&self.pool)
        .await
        .map_err(store)?;
        Ok(())
    }

    pub async fn put_object(
        &self,
        input: PutObjectInput,
    ) -> Result<ObjectStorePutResult, PackError> {
        let (digest, mut manifest) = admit_pack(input.manifest_jcs.as_bytes(), None)?;
        let mut artifacts = BTreeMap::new();
        for (definition_id, definition_digest, canonical_json) in &input.ontology_artifacts {
            artifacts.insert(
                definition_id.as_str().to_owned(),
                (definition_digest.clone(), canonical_json.clone()),
            );
        }
        for dependency in &mut manifest.ontology_dependencies {
            let Some((artifact_digest, canonical_json)) =
                artifacts.remove(dependency.definition_id.as_str())
            else {
                return Err(PackError::MissingDependency(
                    dependency.definition_id.as_str().to_owned(),
                ));
            };
            if artifact_digest.as_str() != dependency.digest.as_str() {
                return Err(PackError::DigestMismatch);
            }
            let actual = hex_sha256(canonical_json.as_bytes());
            if actual != dependency.digest.as_str() {
                return Err(PackError::DigestMismatch);
            }
            dependency.canonical_json = canonical_json;
        }
        if !artifacts.is_empty() {
            return Err(PackError::InvalidFormat(
                "unexpected ontology artifacts".to_owned(),
            ));
        }

        let publisher_id = manifest.publisher.publisher_id.clone();
        self.verify_signature(&publisher_id, &digest, &input.signature)
            .await?;

        if matches!(input.visibility, PackVisibility::Public)
            && !self.public_registry_enabled().await?
        {
            return Err(PackError::PublicRegistryDisabled);
        }

        let mut transaction = self.pool.begin().await.map_err(store)?;
        let existing_digest = sqlx::query(
            "SELECT pack_digest, manifest_jcs FROM pack_registry_objects
             WHERE pack_digest = $1",
        )
        .bind(digest.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store)?;
        if let Some(row) = existing_digest {
            let stored: String = row.try_get("manifest_jcs").map_err(store)?;
            if stored != input.manifest_jcs {
                return Err(PackError::DigestMismatch);
            }
            transaction.commit().await.map_err(store)?;
            return Ok(ObjectStorePutResult::IdempotentReplay {
                pack_digest: digest,
            });
        }

        let version_row = sqlx::query(
            "SELECT pack_digest FROM pack_registry_objects
             WHERE pack_id = $1 AND pack_version = $2",
        )
        .bind(manifest.pack_id.as_str())
        .bind(manifest.version.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store)?;
        if let Some(row) = version_row {
            let other: String = row.try_get("pack_digest").map_err(store)?;
            if other != digest.as_str() {
                return Ok(ObjectStorePutResult::Conflict {
                    reason: ObjectStoreConflictReason::VersionBytesMismatch,
                });
            }
        }

        let signature_json = serde_json::json!({
            "algorithm": input.signature.algorithm,
            "publicKeyId": input.signature.public_key_id.as_str(),
            "signatureB64": input.signature.signature_b64,
        });
        let lock_jcs = serde_jcs::to_string(&serde_json::json!({
            "artifacts": manifest.ontology_dependencies.iter().map(|dependency| {
                serde_json::json!({
                    "definitionId": dependency.definition_id.as_str(),
                    "digest": dependency.digest.as_str(),
                })
            }).collect::<Vec<_>>(),
        }))
        .map_err(|error| PackError::Store(error.to_string()))?;

        sqlx::query(
            "INSERT INTO pack_registry_objects (
                pack_digest, format_version, pack_id, pack_version, publisher_id,
                manifest_jcs, signature_json, lock_jcs, stored_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(digest.as_str())
        .bind(PACK_FORMAT_V1)
        .bind(manifest.pack_id.as_str())
        .bind(manifest.version.as_str())
        .bind(publisher_id.as_str())
        .bind(&input.manifest_jcs)
        .bind(signature_json)
        .bind(&lock_jcs)
        .bind(&input.stored_by)
        .execute(&mut *transaction)
        .await
        .map_err(store)?;

        for dependency in &manifest.ontology_dependencies {
            sqlx::query(
                "INSERT INTO pack_registry_object_ontology (
                    pack_digest, definition_id, definition_digest, canonical_json
                 ) VALUES ($1, $2, $3, $4)",
            )
            .bind(digest.as_str())
            .bind(dependency.definition_id.as_str())
            .bind(dependency.digest.as_str())
            .bind(&dependency.canonical_json)
            .execute(&mut *transaction)
            .await
            .map_err(store)?;
        }

        let (visibility_kind, allowlist) = visibility_columns(&input.visibility);
        sqlx::query(
            "INSERT INTO pack_catalog_entries (
                pack_digest, pack_id, pack_version, publisher_id, outcome_label,
                categories, visibility_kind, tenant_allowlist
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (pack_digest) DO UPDATE SET
                outcome_label = EXCLUDED.outcome_label,
                categories = EXCLUDED.categories,
                visibility_kind = EXCLUDED.visibility_kind,
                tenant_allowlist = EXCLUDED.tenant_allowlist,
                indexed_at = clock_timestamp()",
        )
        .bind(digest.as_str())
        .bind(manifest.pack_id.as_str())
        .bind(manifest.version.as_str())
        .bind(publisher_id.as_str())
        .bind(&input.outcome_label)
        .bind(serde_json::json!(input.categories))
        .bind(visibility_kind)
        .bind(serde_json::json!(allowlist))
        .execute(&mut *transaction)
        .await
        .map_err(store)?;

        transaction.commit().await.map_err(store)?;
        Ok(ObjectStorePutResult::Created {
            pack_digest: digest,
        })
    }

    pub async fn load_object(&self, pack_digest: &PackDigest) -> Result<PackObject, PackError> {
        let row = sqlx::query(
            "SELECT format_version, manifest_jcs, signature_json, lock_jcs,
                    stored_by,
                    (extract(epoch from stored_at) * 1000000)::bigint AS stored_at
             FROM pack_registry_objects
             WHERE pack_digest = $1",
        )
        .bind(pack_digest.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?
        .ok_or(PackError::PackNotFound)?;
        let signature_json: Value = row.try_get("signature_json").map_err(store)?;
        let signature = parse_signature(&signature_json)?;
        let ontology_rows = sqlx::query(
            "SELECT definition_id, definition_digest, canonical_json
             FROM pack_registry_object_ontology
             WHERE pack_digest = $1
             ORDER BY definition_id",
        )
        .bind(pack_digest.as_str())
        .fetch_all(&self.pool)
        .await
        .map_err(store)?;
        let mut ontology = Vec::new();
        for ontology_row in ontology_rows {
            ontology.push(PackObjectOntology {
                definition_id: DefinitionId::parse(
                    ontology_row
                        .try_get::<String, _>("definition_id")
                        .map_err(store)?,
                )?,
                definition_digest: DefinitionDigest::parse(
                    ontology_row
                        .try_get::<String, _>("definition_digest")
                        .map_err(store)?,
                )?,
                canonical_json: ontology_row
                    .try_get::<String, _>("canonical_json")
                    .map_err(store)?,
            });
        }
        Ok(PackObject {
            pack_digest: pack_digest.clone(),
            format_version: row.try_get("format_version").map_err(store)?,
            manifest_jcs: row.try_get("manifest_jcs").map_err(store)?,
            signature,
            ontology,
            lock_jcs: row.try_get("lock_jcs").map_err(store)?,
            stored_at: TimestampMicros::new(row.try_get("stored_at").map_err(store)?),
            stored_by: row.try_get("stored_by").map_err(store)?,
        })
    }

    pub async fn open(
        &self,
        pack_digest: &PackDigest,
        source: ObjectSource,
        viewer_tenant_id: Option<&str>,
    ) -> Result<OpenResult, PackError> {
        let object = match &source {
            ObjectSource::Registry { .. } => match self.load_object(pack_digest).await {
                Ok(object) => object,
                Err(PackError::PackNotFound) => return Ok(OpenResult::ObjectNotFound),
                Err(error) => return Err(error),
            },
            ObjectSource::Inline { object } => object.clone(),
            _ => {
                return Err(PackError::InvalidFormat(
                    "filesystem pack sources are not supported".to_owned(),
                ));
            }
        };

        if let ObjectSource::Registry { endpoint } = &source
            && endpoint == "public"
        {
            match self
                .assert_visibility(pack_digest, viewer_tenant_id, true)
                .await?
            {
                None => {}
                Some(OpenResult::VisibilityDenied) => {
                    return Ok(OpenResult::VisibilityDenied);
                }
                Some(other) => return Ok(other),
            }
        }

        open_object(pack_digest, object, source, self).await
    }

    pub async fn mint_share(
        &self,
        pack_digest: &PackDigest,
        publisher_id: &PublisherId,
        referral_id: &ReferralId,
    ) -> Result<ShareToken, PackError> {
        let _ = self.load_object(pack_digest).await?;
        let token = ShareToken::parse(format!("shr_{}", hex_id()))?;
        sqlx::query(
            "INSERT INTO pack_share_refs (token, pack_digest, publisher_id, referral_id)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(token.as_str())
        .bind(pack_digest.as_str())
        .bind(publisher_id.as_str())
        .bind(referral_id.as_str())
        .execute(&self.pool)
        .await
        .map_err(store)?;
        Ok(token)
    }

    pub async fn resolve_share(&self, token: &ShareToken) -> Result<ShareResolve, PackError> {
        let row = sqlx::query(
            "SELECT s.pack_digest, s.publisher_id, s.referral_id, s.expires_at,
                    o.manifest_jcs, c.blocked_for_new_install, c.advisory_ids
             FROM pack_share_refs AS s
             JOIN pack_registry_objects AS o ON o.pack_digest = s.pack_digest
             LEFT JOIN pack_catalog_entries AS c ON c.pack_digest = s.pack_digest
             WHERE s.token = $1",
        )
        .bind(token.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?;
        let Some(row) = row else {
            return Ok(ShareResolve::NotFound);
        };
        let expired = sqlx::query_scalar::<_, bool>(
            "SELECT expires_at IS NOT NULL AND expires_at < clock_timestamp()
             FROM pack_share_refs WHERE token = $1",
        )
        .bind(token.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(store)?;
        if expired {
            return Ok(ShareResolve::Expired);
        }
        let (_, manifest) = admit_pack(
            row.try_get::<String, _>("manifest_jcs")
                .map_err(store)?
                .as_bytes(),
            None,
        )?;
        let blocked = row
            .try_get::<Option<bool>, _>("blocked_for_new_install")
            .ok()
            .flatten()
            .unwrap_or(false);
        let advisory_ids: Value = row
            .try_get("advisory_ids")
            .unwrap_or(Value::Array(Vec::new()));
        let advisory_id = advisory_ids
            .as_array()
            .and_then(|items| items.first())
            .and_then(Value::as_str)
            .unwrap_or("advisory.deprecated")
            .to_owned();
        Ok(ShareResolve::Ok {
            pack_digest: PackDigest::parse(
                row.try_get::<String, _>("pack_digest").map_err(store)?,
            )?,
            publisher_id: PublisherId::parse(
                row.try_get::<String, _>("publisher_id").map_err(store)?,
            )?,
            referral_id: ReferralId::parse(
                row.try_get::<String, _>("referral_id").map_err(store)?,
            )?,
            presentation: PackPresentation {
                title: manifest.description.title,
                summary: manifest.description.summary,
            },
            install_policy: if blocked {
                ShareInstallPolicy::Blocked { advisory_id }
            } else {
                ShareInstallPolicy::Allowed
            },
        })
    }

    pub async fn search_public(
        &self,
        outcome_query: Option<&str>,
    ) -> Result<Vec<CatalogEntry>, PackError> {
        if !self.public_registry_enabled().await? {
            return Ok(Vec::new());
        }
        let rows = if let Some(query) = outcome_query {
            sqlx::query(
                "SELECT pack_digest, pack_id, pack_version, publisher_id, outcome_label,
                        categories, visibility_kind, tenant_allowlist, deprecated,
                        advisory_ids, install_count, first_success_count,
                        (extract(epoch from indexed_at) * 1000000)::bigint AS indexed_at
                 FROM pack_catalog_entries
                 WHERE visibility_kind = 'public'
                   AND NOT blocked_for_new_install
                   AND outcome_label ILIKE '%' || $1 || '%'
                 ORDER BY pack_id, pack_version",
            )
            .bind(query)
            .fetch_all(&self.pool)
            .await
            .map_err(store)?
        } else {
            sqlx::query(
                "SELECT pack_digest, pack_id, pack_version, publisher_id, outcome_label,
                        categories, visibility_kind, tenant_allowlist, deprecated,
                        advisory_ids, install_count, first_success_count,
                        (extract(epoch from indexed_at) * 1000000)::bigint AS indexed_at
                 FROM pack_catalog_entries
                 WHERE visibility_kind = 'public'
                   AND NOT blocked_for_new_install
                 ORDER BY pack_id, pack_version",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(store)?
        };
        rows.into_iter().map(row_to_catalog).collect()
    }

    pub async fn fetch_catalog_entry(
        &self,
        pack_digest: &PackDigest,
        viewer_tenant_id: Option<&str>,
    ) -> Result<Option<CatalogEntry>, PackError> {
        let row = sqlx::query(
            "SELECT pack_digest, pack_id, pack_version, publisher_id, outcome_label,
                    categories, visibility_kind, tenant_allowlist, deprecated,
                    advisory_ids, install_count, first_success_count,
                    (extract(epoch from indexed_at) * 1000000)::bigint AS indexed_at
             FROM pack_catalog_entries
             WHERE pack_digest = $1",
        )
        .bind(pack_digest.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?;
        let Some(row) = row else {
            return Ok(None);
        };
        let entry = row_to_catalog(row)?;
        match &entry.visibility {
            PackVisibility::Public => Ok(Some(entry)),
            PackVisibility::Local => Ok(None),
            PackVisibility::Private { tenant_allowlist } => {
                if viewer_tenant_id
                    .map(|tenant| tenant_allowlist.iter().any(|allowed| allowed == tenant))
                    .unwrap_or(false)
                {
                    Ok(Some(entry))
                } else {
                    Err(PackError::VisibilityDenied)
                }
            }
        }
    }

    pub async fn record_attribution(
        &self,
        input: RecordAttributionInput<'_>,
    ) -> Result<(), PackError> {
        let share_token_hash = hex_sha256(input.share_token.unwrap_or("").as_bytes());
        let tenant_id_hash = input.tenant_id.map(|tenant| hex_sha256(tenant.as_bytes()));
        let event_id = format!("attr_{}", hex_id());
        let result = sqlx::query(
            "INSERT INTO pack_attribution_events (
                event_id, kind, pack_digest, publisher_id, referral_id,
                share_token_hash, tenant_id_hash, idempotency_key
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (idempotency_key) DO NOTHING",
        )
        .bind(&event_id)
        .bind(input.kind.as_str())
        .bind(input.pack_digest.as_str())
        .bind(input.publisher_id.as_str())
        .bind(input.referral_id.as_str())
        .bind(&share_token_hash)
        .bind(tenant_id_hash)
        .bind(input.idempotency_key)
        .execute(&self.pool)
        .await
        .map_err(store)?;
        if result.rows_affected() == 0 {
            return Ok(());
        }
        match input.kind {
            AttributionEventKind::Installed => {
                sqlx::query(
                    "UPDATE pack_catalog_entries
                     SET install_count = install_count + 1
                     WHERE pack_digest = $1",
                )
                .bind(input.pack_digest.as_str())
                .execute(&self.pool)
                .await
                .map_err(store)?;
            }
            AttributionEventKind::FirstSuccess => {
                sqlx::query(
                    "UPDATE pack_catalog_entries
                     SET first_success_count = first_success_count + 1
                     WHERE pack_digest = $1",
                )
                .bind(input.pack_digest.as_str())
                .execute(&self.pool)
                .await
                .map_err(store)?;
            }
            AttributionEventKind::ShareVisit | AttributionEventKind::InstallIntent => {}
        }
        Ok(())
    }

    pub async fn creator_attribution(
        &self,
        publisher_id: &PublisherId,
        pack_id: &PackId,
    ) -> Result<CreatorAttributionSummary, PackError> {
        let visits = sqlx::query_scalar::<_, i64>(
            "SELECT count(*)::bigint FROM pack_attribution_events AS e
             JOIN pack_registry_objects AS o ON o.pack_digest = e.pack_digest
             WHERE e.publisher_id = $1 AND o.pack_id = $2 AND e.kind = 'share_visit'",
        )
        .bind(publisher_id.as_str())
        .bind(pack_id.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(store)?;
        let installs = sqlx::query_scalar::<_, i64>(
            "SELECT count(*)::bigint FROM pack_attribution_events AS e
             JOIN pack_registry_objects AS o ON o.pack_digest = e.pack_digest
             WHERE e.publisher_id = $1 AND o.pack_id = $2 AND e.kind = 'installed'",
        )
        .bind(publisher_id.as_str())
        .bind(pack_id.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(store)?;
        let first_success_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*)::bigint FROM pack_attribution_events AS e
             JOIN pack_registry_objects AS o ON o.pack_digest = e.pack_digest
             WHERE e.publisher_id = $1 AND o.pack_id = $2 AND e.kind = 'first_success'",
        )
        .bind(publisher_id.as_str())
        .bind(pack_id.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(store)?;
        let digest_rows = sqlx::query(
            "SELECT e.pack_digest,
                    count(*) FILTER (WHERE e.kind = 'installed')::bigint AS installs,
                    count(*) FILTER (WHERE e.kind = 'first_success')::bigint AS first_success
             FROM pack_attribution_events AS e
             JOIN pack_registry_objects AS o ON o.pack_digest = e.pack_digest
             WHERE e.publisher_id = $1 AND o.pack_id = $2
             GROUP BY e.pack_digest
             ORDER BY e.pack_digest",
        )
        .bind(publisher_id.as_str())
        .bind(pack_id.as_str())
        .fetch_all(&self.pool)
        .await
        .map_err(store)?;
        let mut by_digest = Vec::new();
        for row in digest_rows {
            by_digest.push(CreatorAttributionDigestRow {
                pack_digest: PackDigest::parse(
                    row.try_get::<String, _>("pack_digest").map_err(store)?,
                )?,
                installs: row.try_get("installs").map_err(store)?,
                first_success: row.try_get("first_success").map_err(store)?,
            });
        }
        Ok(CreatorAttributionSummary {
            pack_id: pack_id.clone(),
            publisher_id: publisher_id.clone(),
            visits,
            installs,
            first_success_count,
            by_digest,
        })
    }

    pub async fn reindex(&self) -> Result<(i64, i64), PackError> {
        let objects_scanned =
            sqlx::query_scalar::<_, i64>("SELECT count(*)::bigint FROM pack_registry_objects")
                .fetch_one(&self.pool)
                .await
                .map_err(store)?;
        let result = sqlx::query(
            "INSERT INTO pack_catalog_entries (
                pack_digest, pack_id, pack_version, publisher_id, outcome_label,
                categories, visibility_kind, tenant_allowlist
             )
             SELECT o.pack_digest, o.pack_id, o.pack_version, o.publisher_id,
                    coalesce(c.outcome_label, ''),
                    coalesce(c.categories, '[]'::jsonb),
                    coalesce(c.visibility_kind, 'local'),
                    coalesce(c.tenant_allowlist, '[]'::jsonb)
             FROM pack_registry_objects AS o
             LEFT JOIN pack_catalog_entries AS c ON c.pack_digest = o.pack_digest
             ON CONFLICT (pack_digest) DO NOTHING",
        )
        .execute(&self.pool)
        .await
        .map_err(store)?;
        Ok((objects_scanned, result.rows_affected() as i64))
    }

    async fn verify_signature(
        &self,
        publisher_id: &PublisherId,
        pack_digest: &PackDigest,
        signature: &SignatureEvidence,
    ) -> Result<(), PackError> {
        if signature.algorithm != "ed25519" {
            return Err(PackError::SignatureInvalid);
        }
        let row = sqlx::query(
            "SELECT public_key_pem, status
             FROM pack_publisher_keys
             WHERE public_key_id = $1 AND publisher_id = $2",
        )
        .bind(signature.public_key_id.as_str())
        .bind(publisher_id.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?
        .ok_or(PackError::PublisherKeyUnknown)?;
        let status =
            PublisherKeyStatus::parse(&row.try_get::<String, _>("status").map_err(store)?)?;
        if status == PublisherKeyStatus::Revoked {
            return Err(PackError::SignatureInvalid);
        }
        let public_key_pem: String = row.try_get("public_key_pem").map_err(store)?;
        verify_ed25519_signature(
            &public_key_pem,
            pack_digest.as_str(),
            &signature.signature_b64,
        )
    }

    async fn assert_visibility(
        &self,
        pack_digest: &PackDigest,
        viewer_tenant_id: Option<&str>,
        public_only: bool,
    ) -> Result<Option<OpenResult>, PackError> {
        match self
            .fetch_catalog_entry(pack_digest, viewer_tenant_id)
            .await
        {
            Ok(Some(entry)) => {
                if public_only && !matches!(entry.visibility, PackVisibility::Public) {
                    return Ok(Some(OpenResult::VisibilityDenied));
                }
                Ok(None)
            }
            Ok(None) => Ok(Some(OpenResult::ObjectNotFound)),
            Err(PackError::VisibilityDenied) => Ok(Some(OpenResult::VisibilityDenied)),
            Err(error) => Err(error),
        }
    }

    pub async fn load_publisher_key(
        &self,
        public_key_id: &PublicKeyId,
    ) -> Result<PublisherKey, PackError> {
        let row = sqlx::query(
            "SELECT public_key_id, publisher_id, algorithm, public_key_pem, status,
                    (extract(epoch from valid_from) * 1000000)::bigint AS valid_from,
                    (extract(epoch from valid_to) * 1000000)::bigint AS valid_to
             FROM pack_publisher_keys
             WHERE public_key_id = $1",
        )
        .bind(public_key_id.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?
        .ok_or(PackError::PublisherKeyUnknown)?;
        Ok(PublisherKey {
            public_key_id: PublicKeyId::parse(
                row.try_get::<String, _>("public_key_id").map_err(store)?,
            )?,
            publisher_id: PublisherId::parse(
                row.try_get::<String, _>("publisher_id").map_err(store)?,
            )?,
            algorithm: row.try_get("algorithm").map_err(store)?,
            public_key_pem: row.try_get("public_key_pem").map_err(store)?,
            status: PublisherKeyStatus::parse(&row.try_get::<String, _>("status").map_err(store)?)?,
            valid_from: TimestampMicros::new(row.try_get("valid_from").map_err(store)?),
            valid_to: row
                .try_get::<Option<i64>, _>("valid_to")
                .map_err(store)?
                .map(TimestampMicros::new),
        })
    }
}

async fn open_object(
    expected: &PackDigest,
    object: PackObject,
    source: ObjectSource,
    store_ref: &PostgresPackRegistryStore,
) -> Result<OpenResult, PackError> {
    let (actual, mut manifest) = match admit_pack(object.manifest_jcs.as_bytes(), None) {
        Ok(value) => value,
        Err(PackError::DigestMismatch) => {
            return Ok(OpenResult::DigestMismatch {
                expected: expected.clone(),
                actual: expected.clone(),
            });
        }
        Err(error) => return Err(error),
    };
    if actual.as_str() != expected.as_str() {
        return Ok(OpenResult::DigestMismatch {
            expected: expected.clone(),
            actual,
        });
    }
    match store_ref
        .verify_signature(&manifest.publisher.publisher_id, &actual, &object.signature)
        .await
    {
        Ok(()) => {}
        Err(PackError::SignatureInvalid) => return Ok(OpenResult::SignatureInvalid),
        Err(PackError::PublisherKeyUnknown) => return Ok(OpenResult::PublisherKeyUnknown),
        Err(error) => return Err(error),
    }
    for artifact in &object.ontology {
        if let Some(dependency) = manifest
            .ontology_dependencies
            .iter_mut()
            .find(|item| item.definition_id.as_str() == artifact.definition_id.as_str())
        {
            dependency.canonical_json = artifact.canonical_json.clone();
        }
    }
    Ok(OpenResult::Opened {
        pack_digest: actual,
        manifest: Box::new(manifest),
        manifest_jcs: object.manifest_jcs,
        ontology_artifacts: object.ontology,
        signature_verified: true,
        source: Box::new(source),
    })
}

fn verify_ed25519_signature(
    public_key_pem: &str,
    digest_hex: &str,
    signature_b64: &str,
) -> Result<(), PackError> {
    let key_bytes = decode_public_key(public_key_pem)?;
    let verifying_key =
        VerifyingKey::from_bytes(&key_bytes).map_err(|_| PackError::SignatureInvalid)?;
    let signature_bytes = BASE64
        .decode(signature_b64.as_bytes())
        .map_err(|_| PackError::SignatureInvalid)?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| PackError::SignatureInvalid)?;
    let message = hex::decode_digest(digest_hex).map_err(|()| PackError::SignatureInvalid)?;
    verifying_key
        .verify(&message, &signature)
        .map_err(|_| PackError::SignatureInvalid)
}

mod hex {
    pub fn decode_digest(value: &str) -> Result<[u8; 32], ()> {
        if value.len() != 64 {
            return Err(());
        }
        let mut out = [0_u8; 32];
        for (index, chunk) in value.as_bytes().chunks(2).enumerate() {
            let hi = from_hex(chunk[0])?;
            let lo = from_hex(chunk[1])?;
            out[index] = (hi << 4) | lo;
        }
        Ok(out)
    }

    fn from_hex(byte: u8) -> Result<u8, ()> {
        match byte {
            b'0'..=b'9' => Ok(byte - b'0'),
            b'a'..=b'f' => Ok(byte - b'a' + 10),
            _ => Err(()),
        }
    }
}

fn decode_public_key(public_key_pem: &str) -> Result<[u8; 32], PackError> {
    let trimmed = public_key_pem.trim();
    if let Ok(raw) = BASE64.decode(trimmed.as_bytes())
        && raw.len() == 32
    {
        let mut key = [0_u8; 32];
        key.copy_from_slice(&raw);
        return Ok(key);
    }
    let body = trimmed
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<String>();
    let der = BASE64
        .decode(body.as_bytes())
        .map_err(|_| PackError::SignatureInvalid)?;
    if der.len() >= 32 {
        let mut key = [0_u8; 32];
        key.copy_from_slice(&der[der.len() - 32..]);
        return Ok(key);
    }
    Err(PackError::SignatureInvalid)
}

fn parse_signature(value: &Value) -> Result<SignatureEvidence, PackError> {
    Ok(SignatureEvidence {
        algorithm: value
            .get("algorithm")
            .and_then(Value::as_str)
            .ok_or_else(|| PackError::InvalidFormat("signature.algorithm".to_owned()))?
            .to_owned(),
        public_key_id: PublicKeyId::parse(
            value
                .get("publicKeyId")
                .and_then(Value::as_str)
                .ok_or_else(|| PackError::InvalidFormat("signature.publicKeyId".to_owned()))?,
        )?,
        signature_b64: value
            .get("signatureB64")
            .and_then(Value::as_str)
            .ok_or_else(|| PackError::InvalidFormat("signature.signatureB64".to_owned()))?
            .to_owned(),
    })
}

fn visibility_columns(visibility: &PackVisibility) -> (&'static str, Vec<String>) {
    match visibility {
        PackVisibility::Public => ("public", Vec::new()),
        PackVisibility::Private { tenant_allowlist } => ("private", tenant_allowlist.clone()),
        PackVisibility::Local => ("local", Vec::new()),
    }
}

fn row_to_catalog(row: sqlx::postgres::PgRow) -> Result<CatalogEntry, PackError> {
    let visibility_kind: String = row.try_get("visibility_kind").map_err(store)?;
    let allowlist: Value = row.try_get("tenant_allowlist").map_err(store)?;
    let tenant_allowlist = allowlist
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_owned))
        .collect::<Vec<_>>();
    let visibility = match visibility_kind.as_str() {
        "public" => PackVisibility::Public,
        "private" => PackVisibility::Private { tenant_allowlist },
        "local" => PackVisibility::Local,
        other => {
            return Err(PackError::InvalidFormat(format!(
                "invalid visibility: {other}"
            )));
        }
    };
    let categories: Value = row.try_get("categories").map_err(store)?;
    let advisory_ids: Value = row.try_get("advisory_ids").map_err(store)?;
    Ok(CatalogEntry {
        pack_digest: PackDigest::parse(row.try_get::<String, _>("pack_digest").map_err(store)?)?,
        pack_id: PackId::parse(row.try_get::<String, _>("pack_id").map_err(store)?)?,
        version: PackVersion::parse(row.try_get::<String, _>("pack_version").map_err(store)?)?,
        publisher_id: PublisherId::parse(row.try_get::<String, _>("publisher_id").map_err(store)?)?,
        outcome_label: row.try_get("outcome_label").map_err(store)?,
        categories: categories
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(str::to_owned))
            .collect(),
        visibility,
        deprecated: row.try_get("deprecated").map_err(store)?,
        advisory_ids: advisory_ids
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|value| value.as_str().map(str::to_owned))
            .collect(),
        install_count: row.try_get("install_count").map_err(store)?,
        first_success_count: row.try_get("first_success_count").map_err(store)?,
        indexed_at: TimestampMicros::new(row.try_get("indexed_at").map_err(store)?),
    })
}

fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hex_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}

fn store(error: impl ToString) -> PackError {
    PackError::Store(error.to_string())
}
