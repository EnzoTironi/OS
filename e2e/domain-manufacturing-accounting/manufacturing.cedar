@id("manufacturing-tenant-a-discover")
permit (
    principal == Zoen::Principal::"principal.manufacturing-agent.a",
    action == Action::"discover",
    resource
);

@id("manufacturing-tenant-a-commit")
permit (
    principal == Zoen::Principal::"principal.manufacturing-agent.a",
    action == Action::"commit",
    resource
);

@id("manufacturing-tenant-b-discover")
permit (
    principal == Zoen::Principal::"principal.manufacturing-agent.b",
    action == Action::"discover",
    resource
);

@id("manufacturing-tenant-b-commit")
permit (
    principal == Zoen::Principal::"principal.manufacturing-agent.b",
    action == Action::"commit",
    resource
);
