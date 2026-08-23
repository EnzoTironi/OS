@id("direct-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("direct-commit-threshold")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.inputs.quantity <= 5
};
