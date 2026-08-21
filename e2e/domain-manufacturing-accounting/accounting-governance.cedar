permit (
    principal,
    action == Action::"discover",
    resource
);

permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    principal == Zoen::Principal::"principal.accounting-agent.a" ||
    principal == Zoen::Principal::"principal.accounting-agent.b"
};
