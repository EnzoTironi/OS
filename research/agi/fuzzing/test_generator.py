import unittest

from generator import generate, pairwise, shrink_choices


class GeneratorTests(unittest.TestCase):
    def test_replay_is_deterministic(self):
        choices = [3, 2, 1, 4, 5, 6, 7, 8]
        first = generate("fragment", ["D-01", "D-12"], choices, scenario_id="S1")
        second = generate("fragment", ["D-01", "D-12"], choices, scenario_id="S1")
        self.assertEqual(first, second)

    def test_pairwise_has_unique_pairs(self):
        pairs = pairwise(["D-01", "D-02", "D-12"])
        self.assertEqual(pairs, [("D-01", "D-02"), ("D-01", "D-12"), ("D-02", "D-12")])

    def test_external_timeout_stays_unknown_until_observed(self):
        scenario = generate("effects", ["D-12"], [1, 2], scenario_id="S-UNKNOWN")["scenario"]
        kinds = [step["kind"] for step in scenario["timeline"]]
        self.assertEqual(kinds[:2], ["Attempt", "ExternalUnknown"])
        self.assertIn("unknown-safe", [oracle["kind"] for oracle in scenario["oracles"]])
        self.assertNotIn("Failure", kinds)

    def test_stale_approval_declares_state_basis(self):
        live = generate("approval", ["D-11"], [5, 2, 1, 0], scenario_id="S-LIVE")["scenario"]
        frozen = generate("approval", ["D-11"], [5, 2, 1, 1], scenario_id="S-FROZEN")["scenario"]
        self.assertEqual(live["world"]["approval"]["basis"], "live-at-commit")
        self.assertEqual(frozen["world"]["approval"]["basis"], "frozen-snapshot")
        self.assertNotEqual(live["world"]["approval"]["basis"], frozen["world"]["approval"]["basis"])

    def test_shrinker_regenerates_and_preserves_failure_predicate(self):
        # Define a deliberately simple semantic failure: the generated order
        # over-ships relative to its order quantity. The reducer is allowed to
        # change choices only if regeneration remains a failing valid case.
        recipes = ["D-01"]
        initial = [9, 12, 3, 2, 1]

        def fails(record):
            order = record["scenario"]["world"]["order"]
            return order["shipped"] > order["ordered"]

        start = generate("partial", recipes, initial)
        self.assertTrue(fails(start))
        reduced = shrink_choices("partial", recipes, initial, fails)
        end = generate("partial", recipes, reduced)
        self.assertTrue(fails(end))
        self.assertLessEqual(tuple(reduced), tuple(initial))

    def test_contradictory_observations_keep_provenance(self):
        scenario = generate("truth", ["D-13"], [3, 2, 1], scenario_id="S-CONFLICT")["scenario"]
        observations = [step for step in scenario["timeline"] if step["kind"] == "Observe"]
        self.assertEqual(len(observations), 2)
        self.assertNotEqual(observations[0]["source"], observations[1]["source"])
        self.assertNotEqual(observations[0]["body"]["value"], observations[1]["body"]["value"])


if __name__ == "__main__":
    unittest.main()
