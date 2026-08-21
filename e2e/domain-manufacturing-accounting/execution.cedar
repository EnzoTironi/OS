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
    context.inputs.bomRevision == 1 &&
    context.inputs.bomRevisionBasis.amount == "1" &&
    context.inputs.bomRevisionBasis.unit == "each" &&
    (
        principal == Zoen::Principal::"principal.manufacturing-agent.a" ||
        principal == Zoen::Principal::"principal.manufacturing-agent.b"
    )
};
