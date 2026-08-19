@id("remapped-release-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("remapped-release-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.inputs.accepted == true
};
