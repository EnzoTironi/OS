permit (
    principal,
    action == Action::"activate_revision",
    resource
)
when {
    principal == Zoen::Principal::"principal.legacy"
};
