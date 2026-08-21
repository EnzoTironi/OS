@id("identity-tenant-a-discover")
permit (
    principal == Zoen::Principal::"principal.commercial-agent.a",
    action == Action::"discover",
    resource
);

@id("identity-tenant-a-commit")
permit (
    principal == Zoen::Principal::"principal.commercial-agent.a",
    action == Action::"commit",
    resource
);

@id("identity-tenant-b-discover")
permit (
    principal == Zoen::Principal::"principal.commercial-agent.b",
    action == Action::"discover",
    resource
);

@id("identity-tenant-b-commit")
permit (
    principal == Zoen::Principal::"principal.commercial-agent.b",
    action == Action::"commit",
    resource
);
