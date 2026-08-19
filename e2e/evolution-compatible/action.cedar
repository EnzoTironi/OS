permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.actionId == "inventory.replenish"
};
