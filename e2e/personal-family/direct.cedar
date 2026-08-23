@id("pf-discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("pf-request-approval-family-viewer")
permit (
    principal == Zoen::Principal::"principal.family.viewer",
    action == Action::"request_approval",
    resource
);

@id("pf-approve-family-approver")
permit (
    principal == Zoen::Principal::"principal.family.approver",
    action == Action::"approve",
    resource
);

@id("pf-commit-family-approver")
permit (
    principal == Zoen::Principal::"principal.family.approver",
    action == Action::"commit",
    resource
);

@id("pf-commit-org-member")
permit (
    principal == Zoen::Principal::"principal.org.member",
    action == Action::"commit",
    resource
)
when {
    context.inputs.quantity <= 5
};

@id("pf-commit-non-family-viewer")
permit (
    principal,
    action == Action::"commit",
    resource
)
when {
    principal != Zoen::Principal::"principal.family.viewer" &&
    principal != Zoen::Principal::"principal.family.approver" &&
    principal != Zoen::Principal::"principal.org.member" &&
    context.inputs.quantity <= 5
};
