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
    context.inputs.currency == "BRL" &&
    context.inputs.debitAmount == context.inputs.creditAmount &&
    (
        principal == Zoen::Principal::"principal.accounting-agent.a" ||
        principal == Zoen::Principal::"principal.accounting-agent.b"
    )
};
