@id("zoen.world.reserve-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("zoen.world.reserve-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
