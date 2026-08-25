@id("workshop-web-discover")
permit (
    principal == Zoen::Principal::"principal.web.a",
    action == Action::"discover",
    resource
);

@id("workshop-web-commit")
permit (
    principal == Zoen::Principal::"principal.web.a",
    action == Action::"commit",
    resource
);
