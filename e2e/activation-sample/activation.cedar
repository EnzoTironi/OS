permit (
    principal,
    action == Action::"activate_revision",
    resource
)
when {
    principal == Zoen::Principal::"principal.domain-admin.a" ||
    principal == Zoen::Principal::"principal.domain-admin.b"
};
