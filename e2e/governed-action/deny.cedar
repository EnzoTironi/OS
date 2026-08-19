@id("deny-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("deny-commit-candidate")
permit (
    principal,
    action == Action::"commit",
    resource
);

@id("deny-commit")
forbid (
    principal,
    action == Action::"commit",
    resource
);

@id("deny-approval-candidate")
permit (
    principal,
    action == Action::"request_approval",
    resource
);

@id("deny-approval")
forbid (
    principal,
    action == Action::"request_approval",
    resource
);
