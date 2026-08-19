@id("quality-quarantine-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("quality-quarantine-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
