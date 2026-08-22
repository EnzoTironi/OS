permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    principal == Zoen::Principal::"principal.human.a" ||
    principal == Zoen::Principal::"principal.commercial-agent.a" ||
    principal == Zoen::Principal::"principal.commercial-agent.b"
};

permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    principal == Zoen::Principal::"principal.human.a" ||
    principal == Zoen::Principal::"principal.commercial-agent.a" ||
    principal == Zoen::Principal::"principal.commercial-agent.b"
};

forbid (
    principal == Zoen::Principal::"principal.denied.a",
    action,
    resource
);
