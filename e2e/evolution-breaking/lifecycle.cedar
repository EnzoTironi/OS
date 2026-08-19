permit (
    principal,
    action == Action::"activate_revision",
    resource
)
when {
    principal == Zoen::Principal::"principal.admin.a" ||
    principal == Zoen::Principal::"principal.admin.b"
};

permit (
    principal,
    action,
    resource
)
when {
    (
        action == Action::"prepare_migration" ||
        action == Action::"apply_migration_batch"
    ) &&
    (
        context.classification == "breaking" ||
        context.classification == "requires_migration"
    ) &&
    (
        principal == Zoen::Principal::"principal.admin.a" ||
        principal == Zoen::Principal::"principal.admin.b"
    )
};

permit (
    principal,
    action == Action::"rollback_revision",
    resource
)
when {
    principal == Zoen::Principal::"principal.admin.a" ||
    principal == Zoen::Principal::"principal.admin.b"
};
