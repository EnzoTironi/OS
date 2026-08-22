permit (
    principal,
    action == Action::"discover",
    resource
);

permit (
    principal,
    action == Action::"commit",
    resource
);

permit (
    principal,
    action == Action::"request_approval",
    resource
);

forbid (
    principal == Zoen::Principal::"principal.denied.a",
    action,
    resource
);
