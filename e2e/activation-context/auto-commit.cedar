@id("company-brain-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("company-brain-auto-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.inputs.quantity <= 5
};
