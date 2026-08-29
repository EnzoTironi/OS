@id("world.writeNote-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("world.writeNote-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
