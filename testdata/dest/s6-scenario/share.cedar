@id("zoen.world.share-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("zoen.world.share-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
