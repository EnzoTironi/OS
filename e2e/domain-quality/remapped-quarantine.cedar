@id("remapped-quarantine-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("remapped-quarantine-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
