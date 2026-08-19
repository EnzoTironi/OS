@id("quality-release-revoked-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("quality-release-revoked-request-approval")
permit (
    principal,
    action == Action::"request_approval",
    resource
);

@id("quality-release-supervisor-approve")
permit (
    principal,
    action == Action::"approve",
    resource
)
when {
    context.actorId == "actor.supervisor.a"
};

@id("quality-release-revoked-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.approved == true
};
