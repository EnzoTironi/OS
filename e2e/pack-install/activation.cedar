permit (
    principal,
    action == Action::"activate_revision",
    resource
)
when {
    principal == Zoen::Principal::"principal.admin.a" ||
    principal == Zoen::Principal::"principal.admin.b" ||
    principal == Zoen::Principal::"principal.unbound.a"
};
