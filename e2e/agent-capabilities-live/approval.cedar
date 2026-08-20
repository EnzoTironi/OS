@id("agent-live-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("agent-live-request-approval")
permit (
    principal,
    action == Action::"request_approval",
    resource
);

@id("agent-live-approve")
permit (
    principal == Zoen::Principal::"principal.approver.a",
    action == Action::"approve",
    resource
);

@id("agent-live-commit-after-approval")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.approved
};
