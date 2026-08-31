@id("personal-createReminder-discover")
permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "personal.createReminder"
};

@id("personal-createReminder-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.actionId == "personal.createReminder"
};
