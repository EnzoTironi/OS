# Source attribution schema

**Status:** reference.  
**Decision:** `supported` as the required provenance shape for new research notes on this branch.  
**Mode:** lookup.

A research claim is not evidence until it names a source, a license, an evidence class, and a decision state. Put one provenance object on the note, or one object per cited artifact when licenses differ.

After PR 84 merges, also emit the swarm index shard that document describes. This schema stays the licensing-specific block. It does not replace that contract.

## Required fields

| Field | Type | Allowed values |
| --- | --- | --- |
| `question` | string | The real-world distinction under test |
| `sources` | array of `Source` | At least one |
| `evidence_class` | enum | `domain-evidence`, `source-artifact`, `candidate-law`, `counterexample`, `runtime-consequence` |
| `decision_state` | enum | `hypothesis`, `supported`, `rejected`, `undetermined` |
| `extraction_mode` | enum | `concept`, `behavior`, `invariant`, `scenario`, `quote`, `implementation` |
| `reuse_class` | enum | values in `corpus-license-register.md` |
| `reuse_decision` | enum | `none`, `proposed`, `approved`, `rejected` |
| `licensing_note` | string | One sentence. Concepts only, or a pointer to a reuse decision |

`implementation` extraction plus `reuse_decision: none` is invalid. The checklist rejects it.

`accepted` is not a decision state.

## Source object

| Field | Type | Rule |
| --- | --- | --- |
| `name` | string | Human name of the artifact |
| `locator` | string | URL or repo path a second agent can open |
| `path` | string or null | File path inside a repo |
| `ref` | string or null | Branch, tag, or standard edition |
| `sha` | string or null | Commit SHA when the source is git |
| `license` | string | SPDX id, or the license filename when SPDX is `NOASSERTION` or `Other` |
| `license_locator` | string | URL or path of the grant that was read |
| `fetched` | string | ISO date the grant was read |

## JSON Schema

Machine form. `source-attribution.schema.json` in this directory.

Validate an example with:

```bash
python3 -m json.tool research/licensing/examples/work-order-distinction.provenance.json
python3 -c "import json,sys; json.load(open('research/licensing/source-attribution.schema.json'))"
```

## How to fill a note

Write the prose first. Then attach one provenance object.

Set `evidence_class` to the role that sentence plays. A DocType name is a `source-artifact`. The claim that plan and execution are different economic facts is `domain-evidence`. The smallest OS-facing rule is a `candidate-law`. A case that would break that rule is a `counterexample`. A storage or agent-pipeline implication is a `runtime-consequence`.

Set `extraction_mode` to `concept` or `behavior` unless you are quoting. If you quote, keep it short, attribute it, and leave `reuse_decision` at `none`.

Set `reuse_decision` to `proposed` only when the note argues for copying or linking implementation. Do not merge that copy in the same PR as the argument.

## Invalid examples

Missing locator. "ERPNext has work orders."

Brand-level license. "Odoo is LGPL" when the file under discussion is Enterprise.

`extraction_mode: implementation` with no reuse decision.

`decision_state: accepted`.
