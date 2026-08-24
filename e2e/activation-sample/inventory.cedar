@id("inventory-tenant-a-discover")
permit (
    principal == Zoen::Principal::"principal.inventory-agent.a",
    action == Action::"discover",
    resource
);

@id("inventory-tenant-a-commit")
permit (
    principal == Zoen::Principal::"principal.inventory-agent.a",
    action == Action::"commit",
    resource
);

@id("inventory-tenant-b-discover")
permit (
    principal == Zoen::Principal::"principal.inventory-agent.b",
    action == Action::"discover",
    resource
);

@id("inventory-tenant-b-commit")
permit (
    principal == Zoen::Principal::"principal.inventory-agent.b",
    action == Action::"commit",
    resource
);

@id("inventory-web-a-discover")
permit (
    principal == Zoen::Principal::"principal.web.a",
    action == Action::"discover",
    resource
);

@id("inventory-web-a-commit")
permit (
    principal == Zoen::Principal::"principal.web.a",
    action == Action::"commit",
    resource
);
