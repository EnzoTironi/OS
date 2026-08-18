# Cross-cycle acceptance suite — issue #71

**Issue:** #71  
**Status:** hypothesis. Passing this folder is not Architecture v0.  
**Decision:** none. R5, R6, Rust, PostgreSQL, and DataFusion are not selected here.

## What this is

An implementation-neutral acceptance suite for one commercial cycle, plus one in-memory adapter that shows the suite is satisfiable.

The suite is the test surface. Adapters sit behind `apply` / `query` / `explain`.

```text
scenario.json
      │
      ▼
   Runtime
      │
 ┌────┼────────────┐
 ▼    ▼            ▼
stub  reference   later kernel / conventional / SQL
```

Deleting the reference adapter must not delete the suite. Another engine passes #71 by implementing the same commands and observations, not by importing this Python class.

## What this is not

- Not a kernel.
- Not a metamodel. The suite does not require Type + Relation + Computation + Action.
- Not a scorecard and not a gate. Issue #80 is closed. Readiness is whether this suite, durable commit, and ontology evolution survive.
- Not permission to start the Rust product.

The earlier `synthesis/issue-71-cross-cycle-vertical` branch started an R6 runtime before the suite existed. That was the wrong order. This folder publishes the suite first.

## Cycle under test

```text
rival stock claims (ERP 10, sensor 8)
    ↓ admit ERP as operational on-hand
customer intent 12
    ↓ AcceptOrder (human) + frozen quote
commitment 12
    ↓ propose ReserveInventory 10
concurrent ConsumeStock 3
    ↓ stale reject
ReserveInventory 7 (human)
    ↓ shortage 5
CreateProcurementCommitment (agent) + supplier EffectRequest
    ↓ sent / no response = unknown
unsafe retry denied
    ↓ reconcile confirmed
AdmitStockReceipt 5
    ↓ ReserveInventory 5 (same Action, agent)
ShipOrder 12 + carrier unknown
    ↓ duplicate delivery observation does not duplicate
receivable + payment unknown + settlement
    ↓ ontology v2 adds Product.weight
historical AcceptOrder / ShipOrder stay on v1
    ↓ return creates a new record, does not rewrite the shipment
```

Human and agent both commit `ReserveInventory`. That is the same Action, two actors, one authority path.

## How to run

```text
python3 research/synthesis/cross-cycle-vertical/check_research.py
cd research/synthesis/cross-cycle-vertical
python3 -m unittest discover -s tests -v
python3 run.py --adapter reference
```

`python3 run.py --adapter stub` must fail. If it starts passing, the suite stopped discriminating.

## What still is not proved

- The V-001 `os_kernel` does not implement this interface. Green V-001 tests are a smaller recorte.
- In-memory commit here is not the PostgreSQL durable protocol.
- Ontology v2 in this suite is one compatible field add. It is not the #9 migration gauntlet.
- A passing reference does not make R6 true. R6 still needs a discriminator that does not bake R6 into the suite.
