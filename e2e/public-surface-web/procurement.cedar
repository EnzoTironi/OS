@id("procurement-tenant-a-discover")
permit (
    principal == Zoen::Principal::"principal.procurement-agent.a",
    action == Action::"discover",
    resource
);

@id("procurement-tenant-a-commit")
permit (
    principal == Zoen::Principal::"principal.procurement-agent.a",
    action == Action::"commit",
    resource
);

@id("procurement-tenant-b-discover")
permit (
    principal == Zoen::Principal::"principal.procurement-agent.b",
    action == Action::"discover",
    resource
);

@id("procurement-tenant-b-commit")
permit (
    principal == Zoen::Principal::"principal.procurement-agent.b",
    action == Action::"commit",
    resource
);
