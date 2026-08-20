permit (
    principal,
    action == Action::"activate_revision",
    resource
)
when {
    principal == Zoen::Principal::"principal.quality-agent.a" ||
    principal == Zoen::Principal::"principal.quality-agent.b"
};
