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
    (
        principal == Zoen::Principal::"principal.manufacturing-agent.a" ||
        principal == Zoen::Principal::"principal.manufacturing-agent.b"
    )
};
