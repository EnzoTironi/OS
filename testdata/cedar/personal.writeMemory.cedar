@id("personal-writeMemory-discover")
permit (
    principal,
    action == Action::"discover",
    resource
)
when {
    context.actionId == "personal.writeMemory"
};

@id("personal-writeMemory-commit")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.actionId == "personal.writeMemory"
};
