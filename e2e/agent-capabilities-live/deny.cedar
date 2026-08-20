@id("agent-live-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("agent-live-commit-candidate")
permit (
    principal,
    action == Action::"commit",
    resource
);

@id("agent-live-deny-commit")
forbid (
    principal,
    action == Action::"commit",
    resource
);

@id("agent-live-approval-candidate")
permit (
    principal,
    action == Action::"request_approval",
    resource
);

@id("agent-live-deny-approval")
forbid (
    principal,
    action == Action::"request_approval",
    resource
);
