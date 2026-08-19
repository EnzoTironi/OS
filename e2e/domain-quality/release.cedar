@id("quality-release-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("quality-release-request-approval")
permit (
    principal,
    action == Action::"request_approval",
    resource
);

@id("quality-release-approve")
permit (
    principal,
    action == Action::"approve",
    resource
)
when {
    context.actorId == "actor.inspector.a" ||
    context.actorId == "actor.supervisor.a"
};

@id("quality-release-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.approved == true &&
    context.inputs.accepted == true
};
