{{- define "zoen.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: zoen
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | quote }}
zoen.dev/profile: {{ .Values.profile | quote }}
{{- end }}

{{- define "zoen.rustImage" -}}
{{- required "images.rust.repository is required" .Values.images.rust.repository -}}@{{- required "images.rust.digest is required" .Values.images.rust.digest -}}
{{- end }}

{{- define "zoen.nodeImage" -}}
{{- required "images.node.repository is required" .Values.images.node.repository -}}@{{- required "images.node.digest is required" .Values.images.node.digest -}}
{{- end }}

{{- define "zoen.databaseEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.runtimeSecret.name }}
      key: {{ .Values.runtimeSecret.databaseUrlKey }}
{{- end }}

{{- define "zoen.objectStoreEnv" -}}
- name: S3_ACCESS_KEY_ID
  valueFrom:
    secretKeyRef:
      name: {{ .Values.runtimeSecret.name }}
      key: {{ .Values.runtimeSecret.s3AccessKeyIdKey }}
- name: S3_ALLOW_HTTP
  value: {{ .Values.objectStorage.allowHttp | quote }}
- name: S3_ENDPOINT
  value: {{ .Values.objectStorage.endpoint | quote }}
- name: S3_REGION
  value: {{ .Values.objectStorage.region | quote }}
- name: S3_SECRET_ACCESS_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.runtimeSecret.name }}
      key: {{ .Values.runtimeSecret.s3SecretAccessKeyKey }}
{{- end }}

{{- define "zoen.telemetryEnv" -}}
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: {{ .Values.telemetry.endpoint | quote }}
- name: OTEL_SDK_DISABLED
  value: {{ not .Values.telemetry.enabled | quote }}
{{- end }}

{{- define "zoen.restateReplicas" -}}
{{- if eq .Values.restate.topology.mode "production" -}}
{{- .Values.restate.topology.productionReplicas -}}
{{- else -}}
{{- .Values.restate.topology.referenceReplicas -}}
{{- end -}}
{{- end }}

{{- define "zoen.restateMetadataAddresses" -}}
{{- $replicas := include "zoen.restateReplicas" . | int -}}
{{- $addresses := list -}}
{{- range $i := until $replicas -}}
{{- $addresses = append $addresses (printf "\"http://restate-%d.restate-headless:5122\"" $i) -}}
{{- end -}}
{{- join "," $addresses -}}
{{- end }}

{{- define "zoen.walGEnv" -}}
- name: AWS_ACCESS_KEY_ID
  valueFrom:
    secretKeyRef:
      name: {{ .Values.runtimeSecret.name }}
      key: {{ .Values.runtimeSecret.s3AccessKeyIdKey }}
- name: AWS_ENDPOINT
  value: {{ .Values.objectStorage.endpoint | quote }}
- name: AWS_REGION
  value: {{ .Values.objectStorage.region | quote }}
- name: AWS_S3_FORCE_PATH_STYLE
  value: "true"
- name: AWS_SECRET_ACCESS_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.runtimeSecret.name }}
      key: {{ .Values.runtimeSecret.s3SecretAccessKeyKey }}
- name: WALG_COMPRESSION_METHOD
  value: lz4
- name: WALG_S3_PREFIX
  value: s3://{{ .Values.postgres.walArchive.bucket }}/postgres
{{- end }}

{{- define "zoen.preflight" -}}
initContainers:
  - name: dependency-preflight
    image: {{ include "zoen.nodeImage" . }}
    imagePullPolicy: Always
    command: [node, /app/deploy/scripts/preflight-dependencies.mjs]
    env:
      {{- include "zoen.databaseEnv" . | nindent 6 }}
      {{- include "zoen.objectStoreEnv" . | nindent 6 }}
      - name: S3_BUCKET
        value: {{ .Values.objectStorage.projectionBucket | quote }}
      - name: ZOEN_CONFIG_VERSION
        value: {{ .Values.configVersion | quote }}
      - name: ZOEN_MIGRATION_COMPATIBILITY
        value: {{ .Values.migration.compatibility | quote }}
      - name: ZOEN_OIDC_ISSUER
        value: {{ .Values.global.publicOidcIssuer | quote }}
      - name: ZOEN_OIDC_DISCOVERY_URL
        value: {{ .Values.keycloak.discoveryUrl | quote }}
      - name: ZOEN_RESTATE_ADMIN_URL
        value: {{ .Values.restate.adminUrl | quote }}
      - name: ZOEN_TENANT_AWARENESS
        value: {{ .Values.tenantAwareness | quote }}
{{- end }}
