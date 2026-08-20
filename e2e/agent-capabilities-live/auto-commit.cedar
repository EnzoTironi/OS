@id("agent-live-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("agent-live-auto-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.inputs.quantity <= 5
};
