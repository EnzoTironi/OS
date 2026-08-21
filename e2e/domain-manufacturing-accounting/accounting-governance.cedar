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
    (
        context.actionId != "accounting.applySettlement" ||
        (
            context.inputs.amount != "0" &&
            !(context.inputs.amount like "-*")
        )
    ) &&
    (
        principal == Zoen::Principal::"principal.accounting-agent.a" ||
        principal == Zoen::Principal::"principal.accounting-agent.b"
    )
};
