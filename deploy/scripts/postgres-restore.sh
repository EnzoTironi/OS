#!/usr/bin/env bash
set -euo pipefail

namespace="${1:?namespace is required}"

primary="postgres-0"
pgdata="/var/lib/postgresql/18/docker"

kubectl --namespace "${namespace}" scale statefulset postgres --replicas=0
kubectl --namespace "${namespace}" wait --for=delete "pod/${primary}" --timeout=180s >/dev/null 2>&1 || true
if kubectl --namespace "${namespace}" get statefulset postgres-replica >/dev/null 2>&1; then
  kubectl --namespace "${namespace}" scale statefulset postgres-replica --replicas=0
  kubectl --namespace "${namespace}" wait --for=delete \
    --selector zoen.dev/postgres-role=replica \
    pod --timeout=180s >/dev/null 2>&1 || true
fi

kubectl --namespace "${namespace}" delete job postgres-restore --ignore-not-found --wait=true
cat <<EOF | kubectl apply --filename -
apiVersion: batch/v1
kind: Job
metadata:
  name: postgres-restore
  namespace: ${namespace}
spec:
  backoffLimit: 1
  template:
    spec:
      restartPolicy: Never
      initContainers:
        - name: install-wal-g
          image: ${ZOEN_WALG_IMAGE:-chekkan/wal-g:v3.0.7}
          securityContext:
            runAsUser: 0
          command: ["/bin/bash", "-c", "cp /usr/local/bin/wal-g /wal-g/wal-g && chmod 0755 /wal-g/wal-g"]
          volumeMounts:
            - name: wal-g
              mountPath: /wal-g
      containers:
        - name: restore
          image: ${ZOEN_POSTGRES_IMAGE:-pgvector/pgvector:pg18}
          command: ["/bin/bash", "-c"]
          args:
            - |
              set -euo pipefail
              rm -rf "${pgdata:?}"/*
              mkdir -p "${pgdata}"
              /wal-g/wal-g backup-fetch "${pgdata}" LATEST
              touch "${pgdata}/recovery.signal"
              printf "restore_command = '/wal-g/wal-g wal-fetch %%f %%p'\nrecovery_target_action = 'promote'\n" >> "${pgdata}/postgresql.auto.conf"
              chown -R postgres:postgres /var/lib/postgresql
          env:
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: zoen-runtime
                  key: s3AccessKeyId
            - name: AWS_ENDPOINT
              value: ${ZOEN_OBJECT_ENDPOINT:-http://minio:9000}
            - name: AWS_REGION
              value: us-east-1
            - name: AWS_S3_FORCE_PATH_STYLE
              value: "true"
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: zoen-runtime
                  key: s3SecretAccessKey
            - name: WALG_S3_PREFIX
              value: s3://${ZOEN_WAL_BUCKET:-zoen-wal}/postgres
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql
            - name: wal-g
              mountPath: /wal-g
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: data-postgres-0
        - name: wal-g
          emptyDir: {}
EOF

kubectl --namespace "${namespace}" wait --for=condition=complete job/postgres-restore --timeout=10m
kubectl --namespace "${namespace}" scale statefulset postgres --replicas=1
kubectl --namespace "${namespace}" rollout status statefulset/postgres --timeout=10m
kubectl --namespace "${namespace}" exec "${primary}" -- \
  psql -U postgres -d zoen -c "SELECT pg_is_in_recovery();"

if kubectl --namespace "${namespace}" get statefulset postgres-replica >/dev/null 2>&1; then
  kubectl --namespace "${namespace}" exec "${primary}" -- \
    psql -U postgres -d zoen -c \
    "SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = 'zoen_replica';" \
    >/dev/null
  kubectl --namespace "${namespace}" delete pvc data-postgres-replica-0 --ignore-not-found --wait=true
  kubectl --namespace "${namespace}" scale statefulset postgres-replica --replicas=1
  kubectl --namespace "${namespace}" rollout status statefulset/postgres-replica --timeout=10m
  replica_ready="$(
    kubectl --namespace "${namespace}" get statefulset postgres-replica \
      --output jsonpath='{.status.readyReplicas}'
  )"
  running="$(
    kubectl --namespace "${namespace}" get pods \
      --selector app.kubernetes.io/name=postgres \
      --field-selector status.phase=Running \
      --no-headers |
      wc -l | tr -d ' '
  )"
  if [[ "${replica_ready}" -lt 1 || "${running}" -lt 2 ]]; then
    echo "HA restore left ${running} PostgreSQL instance(s); streaming replica is required" >&2
    exit 1
  fi
fi
