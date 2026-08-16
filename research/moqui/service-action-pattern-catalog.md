# Service and Action pattern catalog

Which Moqui Service patterns are close to a first-class Action. Evidence in `research/notes/issue-0034-moqui-mantle-archaeology.md`.

Action-equivalent here means the operation names a business verb, validates input, checks authority, owns or joins a transaction, and can fail without pretending the attempt never existed. This is a research test, not an OS decision. See L-001.

## Pattern table

| Pattern | Example | Action-like | Why | Decision |
| --- | --- | --- | --- | --- |
| Defined business verb | `place#Order`, `pack#Shipment`, `authorize#Payment` | Yes, closest | Names the intervention. USL implements these as inline services. E-022 | `hypothesis` |
| Composed create | `create#Person` | Partial | One verb writes Party, Person, and optional PartyRole. Still a create, not a commercial decision. E-004 | `hypothesis` |
| Role-specialized create | `create#PersonCustomer`, `create#PersonEmployee` | Partial | Encodes a role in the verb. Closer to "onboard as customer" than `create#Party` | `hypothesis` |
| Interface plus gateway | `authorize#Payment`, `capture#Payment` | Yes for the verb | Interface services sit in front of gateway runners. External outcome can be unknown. E-022, Payment docs | `hypothesis` |
| Implicit entity CRUD | `create#mantle.party.Party`, `update#UserAccount` | No | Invented from the entity. No business noun beyond the table. E-003. X-001 | `supported` as not Action-like |
| entity-auto defined CRUD | service `type="entity-auto"` with entity noun | No | Same as implicit CRUD with extra parameter mapping | `supported` as not Action-like |
| Derived-field updater | `update#AssetFromDetail`, `update#InvoiceTotals` | No | Maintains a projection. EECA calls these. E-010 | `supported` as not Action-like |
| Query or display | `get#InvoiceDisplayInfo`, `find#Party` | No | Read path | `supported` as not Action-like |
| SECA post-service | Shipment update creates invoices | Trigger, not Action | Attaches a second operation to a named update. E-009. L-005 | `hypothesis` |
| SECA tx-commit | send order or shipment email | Effect after commit | Matches "do not tell the world until it landed". E-006, E-009 | `hypothesis` |
| EECA on entity write | TimeEntry updates task totals | Not Action | Official docs say do not use this for process. E-008. D-003 | `supported` as not Action-like |
| Screen transition | REST or form posts to a service | Surface | Artifact authz can inherit from the screen. E-007 | `hypothesis` |
| Job or async | `ServiceJob`, `async()` | Same Action, different time | Scheduler and async are invocation modes. Calling Services page | `hypothesis` |

## How a call runs

1. Caller names path, verb, and noun.
2. Service Facade cleans and validates parameters.
3. Artifact Execution checks authz unless disabled.
4. Transaction policy on the service begins, joins, ignores, or forces a new transaction.
5. Implementation runs. Inline XML, script, Java, entity-auto, or remote.
6. SECA rules may run at documented phases. USL uses `post-service` and `tx-commit`.
7. Declared out-parameters are collected from context.

Citations. E-001, E-002, E-005, E-007, E-009.

## Where SOA keeps verbs that CRUD loses

CRUD on OrderHeader can set `statusId` to a placed value. `place#Order` says the customer accepted. USL also has `propose#Order`, `approve#Order`, `reject#Order`, and `cancel#Order`. Those verbs stay visible to screens, REST, jobs, and SECA.

CRUD on Asset can write `quantityOnHandTotal`. Mantle instead records an AssetDetail and updates the total. `reserve#AssetsForOrder`, `issue#Asset`, and `receive#Asset` name why quantity changed.

CRUD on Invoice and Payment can mark paid. `apply#PaymentForInvoice` and `PaymentApplication` keep the many-to-many fact. Unapplied cash is representable. I-006.

ERPNext keeps verbs as DocType submit and "Create Delivery Note". That is document-centric, not table-centric. Odoo quotations confirm into sales orders. Both preserve some verbs. They still hide others behind field writes. This comparison is `hypothesis` until those code paths are opened. E-024, E-025.

## Framework artifact versus domain law

Framework artifact.

- Facade split Entity, Service, Screen
- Hash in the service name
- XML Actions
- SECA and EECA file extensions
- Inheritable artifact authz
- TransactionCache

Domain law candidates.

- Named operations for place, pack, issue, apply, authorize
- Party versus role
- Product versus asset versus quantity change
- Order versus shipment versus invoice versus payment
- Immutable contact mechanisms
- Many-to-many payment application

See L-001 through L-006.

## Composition

USL composes domains by calling services and by SECA on those services.

- Place or update order, then reserve assets. `ProductAsset.secas.xml`
- Update shipment, then create sales or purchase invoices. `AccountingInvoice.secas.xml`
- Update order, then authorize payments. `AccountingPayment.secas.xml`
- Update return, then create return shipment and process responses. `OrderReturn.secas.xml`

That is the SOA answer to "how cross-domain behavior is composed". It is closer to Action consequences than to database triggers. L-005. Still `hypothesis` because some EECA rules may leak process work. X-003.
