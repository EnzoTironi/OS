permit (
    principal,
    action == Action::"activate_revision",
    resource
)
when {
    principal == Zoen::Principal::"principal.agent.a" ||
    principal == Zoen::Principal::"principal.agent.b"
};
