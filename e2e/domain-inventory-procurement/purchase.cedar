permit (
    principal,
    action == Action::"discover",
    resource
);

permit (
    principal,
    action == Action::"request_approval",
    resource
);

permit (
    principal,
    action == Action::"approve",
    resource
)
when {
    context.actorId == "actor.procurement-supervisor.a" ||
    context.actorId == "actor.procurement-supervisor.b"
};

permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.approved == true
};
