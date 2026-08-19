@id("human-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("human-request-approval")
permit (
    principal,
    action == Action::"request_approval",
    resource
);

@id("human-approve")
permit (
    principal == Zoen::Principal::"principal.approver.a",
    action == Action::"approve",
    resource
);

@id("human-commit-after-approval")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.approved
};
