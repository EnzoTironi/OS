@id("shadow-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("shadow-forbid-commit")
forbid (
    principal,
    action == Action::"commit",
    resource
);
