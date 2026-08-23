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
    context.inputs.quantity.unit == "each" &&
    context.inputs.unitPrice == "18.5"
};

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
    context.approved == true &&
    context.inputs.quantity.unit == "each" &&
    context.inputs.unitPrice == "18.5"
};
