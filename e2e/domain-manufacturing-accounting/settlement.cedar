permit (
    principal,
    action == Action::"discover",
    resource
);

permit (
    principal,
    action == Action::"request_approval",
    resource
)
when {
    context.inputs.currency == "BRL" &&
    (
        principal == Zoen::Principal::"principal.accounting-agent.a" ||
        principal == Zoen::Principal::"principal.accounting-agent.b"
    )
};

permit (
    principal,
    action == Action::"approve",
    resource
)
when {
    context.actorId == "actor.accounting-supervisor.a" ||
    context.actorId == "actor.accounting-supervisor.b"
};

permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.approved == true &&
    context.inputs.currency == "BRL" &&
    (
        principal == Zoen::Principal::"principal.accounting-agent.a" ||
        principal == Zoen::Principal::"principal.accounting-agent.b"
    )
};
