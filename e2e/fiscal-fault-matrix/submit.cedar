permit (
    principal,
    action == Action::"discover",
    resource
);

permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.inputs.requestReference like "document-request-fault-*"
};

permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    context.inputs.requestReference like "document-request-live-*"
};
