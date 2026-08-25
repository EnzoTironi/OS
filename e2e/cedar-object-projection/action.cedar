@id("discover")
permit (
    principal,
    action == Action::"discover",
    resource
);

@id("permit-named-order-line")
permit (
    principal,
    action == Action::"commit",
    resource == Zoen::Resource::"commercial.order-line.permitted"
)
when {
    principal in Zoen::Tenant::"tenant.a" &&
    resource has objectType &&
    resource.objectType == "commercial.OrderLine" &&
    resource has commercial_requestReference &&
    resource.commercial_requestReference == Zoen::Resource::"commercial.request.permitted"
};
