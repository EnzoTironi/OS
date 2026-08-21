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
    decimal("0").lessThan(decimal(context.inputs.quantity.amount)) &&
    context.inputs.quantity.unit == "each" &&
    decimal("0").lessThan(decimal(context.inputs.unitPrice))
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
    decimal("0").lessThan(decimal(context.inputs.quantity.amount)) &&
    context.inputs.quantity.unit == "each" &&
    decimal("0").lessThan(decimal(context.inputs.unitPrice))
};
