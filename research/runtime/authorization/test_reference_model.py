#!/usr/bin/env python3
from __future__ import annotations

import unittest

from reference_model import (
    AuthorityWorld,
    Authorizer,
    Decision,
    Participation,
    Request,
    WorkloadBinding,
    grant,
)


class AuthorizationSemanticsTests(unittest.TestCase):
    def setUp(self):
        self.world = AuthorityWorld()
        self.world.bind_workload(WorkloadBinding("W1", "AgentA", "T1", "production"))
        self.parent = grant(
            "G1",
            "HumanH",
            "AgentA",
            "HumanH",
            actions=["Quote", "SelectSupplier", "ApprovePayment"],
            resources=["RFQ7", "PAY1"],
            purposes=["rfq", "payment"],
            amount_limit=50_000,
            valid_until=100,
            may_subdelegate=True,
            remaining_depth=2,
        )
        self.world.add_grant(self.parent)
        self.authz = Authorizer(self.world)

    def request(self, **kwargs):
        values = dict(
            workload_id="W1",
            actor_id="AgentA",
            represented_principal_id="HumanH",
            tenant="T1",
            environment="production",
            action="Quote",
            resource="RFQ7",
            purpose="rfq",
            now=10,
            amount=10_000,
            relied_grant_ids=("G1",),
        )
        values.update(kwargs)
        return Request(**values)

    def test_workload_authentication_without_actor_binding_is_denied(self):
        req = self.request(workload_id="UnknownWorkload")
        self.assertEqual(self.authz.authorize(req).decision, Decision.DENIED)

    def test_correct_workload_actor_grant_allows(self):
        result = self.authz.authorize(self.request())
        self.assertEqual(result.decision, Decision.ALLOWED)
        self.assertEqual(result.grant_ids, ("G1",))

    def test_cross_tenant_is_denied(self):
        req = self.request(tenant="T2")
        self.assertEqual(self.authz.authorize(req).decision, Decision.DENIED)

    def test_represented_principal_is_not_implicitly_actor(self):
        req = self.request(represented_principal_id="OtherHuman")
        self.assertEqual(self.authz.authorize(req).decision, Decision.DENIED)

    def test_scope_does_not_expand_to_unrelated_action(self):
        req = self.request(action="DeleteCompany")
        self.assertEqual(self.authz.authorize(req).decision, Decision.DENIED)

    def test_amount_limit_is_enforced(self):
        req = self.request(amount=80_000)
        self.assertEqual(self.authz.authorize(req).decision, Decision.DENIED)

    def test_expired_grant_is_denied(self):
        req = self.request(now=100)
        self.assertEqual(self.authz.authorize(req).decision, Decision.DENIED)

    def test_emergency_deny_overrides_positive_grant(self):
        self.world.deny("T1", "Quote", "RFQ7")
        result = self.authz.authorize(self.request())
        self.assertEqual(result.decision, Decision.DENIED)
        self.assertIn("deny", result.reason)

    def test_evaluator_outage_is_indeterminate_but_not_allowed(self):
        result = self.authz.authorize(self.request(), evaluator_available=False)
        self.assertEqual(result.decision, Decision.INDETERMINATE)
        self.assertNotEqual(result.decision, Decision.ALLOWED)

    def test_valid_narrowed_subgrant(self):
        child = grant(
            "G2",
            "AgentA",
            "SubAgentB",
            "HumanH",
            actions=["Quote"],
            resources=["RFQ7"],
            purposes=["rfq"],
            amount_limit=10_000,
            valid_until=50,
            may_subdelegate=False,
            remaining_depth=0,
            parent_grant_id="G1",
        )
        self.world.add_grant(child)
        self.world.bind_workload(WorkloadBinding("W2", "SubAgentB", "T1", "production"))
        result = self.authz.authorize(
            Request("W2", "SubAgentB", "HumanH", "T1", "production", "Quote", "RFQ7", "rfq", 20, 5_000, ("G2",))
        )
        self.assertEqual(result.decision, Decision.ALLOWED)

    def test_subgrant_cannot_expand_action(self):
        child = grant(
            "G2",
            "AgentA",
            "SubAgentB",
            "HumanH",
            actions=["Quote", "AdminEverything"],
            resources=["RFQ7"],
            purposes=["rfq"],
            amount_limit=10_000,
            valid_until=50,
            parent_grant_id="G1",
        )
        with self.assertRaises(ValueError):
            self.world.add_grant(child)

    def test_subgrant_cannot_expand_amount(self):
        child = grant(
            "G2",
            "AgentA",
            "SubAgentB",
            "HumanH",
            actions=["Quote"],
            resources=["RFQ7"],
            purposes=["rfq"],
            amount_limit=100_000,
            valid_until=50,
            parent_grant_id="G1",
        )
        with self.assertRaises(ValueError):
            self.world.add_grant(child)

    def test_subgrant_cannot_outlive_parent(self):
        child = grant(
            "G2",
            "AgentA",
            "SubAgentB",
            "HumanH",
            actions=["Quote"],
            resources=["RFQ7"],
            purposes=["rfq"],
            amount_limit=10_000,
            valid_until=200,
            parent_grant_id="G1",
        )
        with self.assertRaises(ValueError):
            self.world.add_grant(child)

    def test_subgrant_cannot_change_represented_authority(self):
        child = grant(
            "G2",
            "AgentA",
            "SubAgentB",
            "OtherHuman",
            actions=["Quote"],
            resources=["RFQ7"],
            purposes=["rfq"],
            amount_limit=10_000,
            valid_until=50,
            parent_grant_id="G1",
        )
        with self.assertRaises(ValueError):
            self.world.add_grant(child)

    def test_sod_can_compare_actor_identity(self):
        self.world.participation.append(Participation("PAY1", "ProposePayment", "AgentA", "HumanH"))
        req = self.request(action="ApprovePayment", resource="PAY1", purpose="payment")
        result = self.authz.authorize_independent_approval(
            req, case_id="PAY1", prohibited_prior_action="ProposePayment", independence_by="actor"
        )
        self.assertEqual(result.decision, Decision.DENIED)

    def test_sod_can_compare_represented_authority_across_two_agents(self):
        self.world.participation.append(Participation("PAY1", "ProposePayment", "OtherAgent", "HumanH"))
        req = self.request(action="ApprovePayment", resource="PAY1", purpose="payment")
        result = self.authz.authorize_independent_approval(
            req,
            case_id="PAY1",
            prohibited_prior_action="ProposePayment",
            independence_by="represented_principal",
        )
        self.assertEqual(result.decision, Decision.DENIED)

    def test_different_represented_humans_can_be_independent_when_rule_says_so(self):
        self.world.participation.append(Participation("PAY1", "ProposePayment", "AgentB", "HumanOther"))
        req = self.request(action="ApprovePayment", resource="PAY1", purpose="payment")
        result = self.authz.authorize_independent_approval(
            req,
            case_id="PAY1",
            prohibited_prior_action="ProposePayment",
            independence_by="represented_principal",
        )
        self.assertEqual(result.decision, Decision.ALLOWED)

    def test_revoked_grant_fails_future_use(self):
        revoked = grant(
            "G-revoked",
            "HumanH",
            "AgentA",
            "HumanH",
            actions=["Quote"],
            resources=["RFQ7"],
            purposes=["rfq"],
            active=False,
        )
        self.world.add_grant(revoked)
        req = self.request(relied_grant_ids=("G-revoked",))
        self.assertEqual(self.authz.authorize(req).decision, Decision.DENIED)


if __name__ == "__main__":
    unittest.main()
