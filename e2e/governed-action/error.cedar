@id("error-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("error-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.missing == true
};
