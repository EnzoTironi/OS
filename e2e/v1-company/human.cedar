permit (
    principal == Zoen::Principal::"principal.human.a",
    action == Action::"discover",
    resource
);

permit (
    principal == Zoen::Principal::"principal.human.a",
    action == Action::"commit",
    resource
);

permit (
    principal == Zoen::Principal::"principal.commercial-agent.a" ||
    principal == Zoen::Principal::"principal.commercial-agent.b",
    action == Action::"discover",
    resource
);

permit (
    principal == Zoen::Principal::"principal.commercial-agent.a" ||
    principal == Zoen::Principal::"principal.commercial-agent.b",
    action == Action::"commit",
    resource
);

forbid (
    principal == Zoen::Principal::"principal.denied.a",
    action,
    resource
);
