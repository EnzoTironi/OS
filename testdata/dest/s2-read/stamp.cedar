@id("world.stampLow-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("world.stampLow-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
