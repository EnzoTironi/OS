@id("zoen.world.invite-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("zoen.world.invite-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
