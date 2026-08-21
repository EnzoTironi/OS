{{- define "zoen.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: zoen
zoen.dev/profile: {{ .Values.profile | quote }}
{{- end }}

{{- define "zoen.rustImage" -}}
{{- required "images.rust.repository is required" .Values.images.rust.repository -}}@{{- required "images.rust.digest is required" .Values.images.rust.digest -}}
{{- end }}

{{- define "zoen.nodeImage" -}}
{{- required "images.node.repository is required" .Values.images.node.repository -}}@{{- required "images.node.digest is required" .Values.images.node.digest -}}
{{- end }}
