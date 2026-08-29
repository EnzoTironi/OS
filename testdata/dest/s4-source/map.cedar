@id("source.mapQuantity-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("source.mapQuantity-commit")
permit (
    principal,
    action == Action::"commit",
    resource
);
