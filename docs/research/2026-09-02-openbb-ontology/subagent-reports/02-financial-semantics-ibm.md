# Financial semantics and the IBM identity-resolution case

**Subagent role:** Financial identity, observation, query-semantics, provenance, and rights research lane  
**Research date:** 2026-09-02  
**Scope:** FIGI 1.2 and OpenFIGI, Bloomberg BLPAPI/reference data/BQL public material, SEC EDGAR XBRL and Companyfacts, and FIBO  
**Method:** Primary-source inspection, immutable local capture and hashing, source-repository cloning at exact commits, live OpenFIGI mapping queries, SEC filing/API comparison, and explicit separation of documented facts from design inference  
**Evidence directory:** /private/tmp/zoen-openbb-deep.0N6mfl/finance-lane

## Source and checksum header

The principal immutable captures used in this report are:

| Source artifact | Upstream URL | SHA-256 |
|---|---|---|
| FIGI 1.2 normative PDF | https://www.omg.org/spec/FIGI/1.2/PDF | e932920edc3d95fd75f3240a6f02ef31984fe02a7d26625d51a603fe25809962 |
| FIGI 1.2 normative Turtle/OWL | https://www.omg.org/spec/FIGI/20240801/FIGI-1.2-TurtleSerializedOWL/GlobalInstrumentIdentifiers.ttl | b47c055727f32e3dcd134bb61c6c2f0847c0addbf096655b1f826f0a03bc0a2a |
| FIGI allocation rules | https://www.openfigi.com/docs/figi-allocation-rules.pdf | b9f12e02140ca1d82e724c108f7bd304adefe97cb860eb9319ce603ed9d621a2 |
| OpenFIGI OpenAPI schema | https://api.openfigi.com/schema | d83fbc4ad3053c23684ec9c9b24e667d61ef1022e1d98456252f8cba3159d520 |
| OpenFIGI IBM exact-ticker response | Live POST to https://api.openfigi.com/v3/mapping, captured 2026-09-02 | 9ab2abd1fa8ea5603465e57c92bcb6a521721bf75affca9c6632a54f53587e17 |
| OpenFIGI IBM/XNYS response | Live POST to https://api.openfigi.com/v3/mapping, captured 2026-09-02 | b36837a63a6837e9e034585e738b237fb8e5a198086f5396da621f1a2c74215b |
| Bloomberg BLPAPI Core Developer Guide | Linked from https://bloomberg.github.io/blpapi-docs/ | 2c8d73815e9e468a72d2476237f00bff3854d99995de132a97945ddbfd0888c6 |
| Bloomberg BQuant Enterprise equity fact sheet | https://assets.bbhub.io/professional/sites/41/BQuant-Enterprise-Equity-Quant-Jan-24-2.pdf | f8c2e5f7eac57aaf08c92b4983cc029dd8f4621310b24bd682a06f380a99d6df |
| SEC EDGAR XBRL Guide, 2026-06-29 | https://www.sec.gov/files/edgar/filer-information/specifications/xbrl-guide-2026-06-29.pdf | 1dce8479705ec1f8737d421e69a439d606d232f26e46338634cb4444b7dd3b86 |
| IBM Companyfacts capture | https://data.sec.gov/api/xbrl/companyfacts/CIK0000051143.json | 1660477fa5713e5749c3038cf22b3c776414acfc6e1e721d1772c91101dc5e5c |
| IBM submissions capture | https://data.sec.gov/submissions/CIK0000051143.json | 0d698f754c7aa7f9373bc90b65d73d801e018ad176b6ffb5e4ec0f6d18fa984f |
| IBM 2025 10-K Inline XBRL document | https://www.sec.gov/Archives/edgar/data/51143/000005114326000010/ibm-20251231.htm | d4669e1c5c4536b8297cc3c8d3366129d3fc8acf39f968f1c68dd29ebe03b86a |
| IBM 2025 10-K extension schema | https://www.sec.gov/Archives/edgar/data/51143/000005114326000010/ibm-20251231.xsd | 5319871e1670261aa8b7891475b6e3a8785b6b99cf57b68eee54514bb4d55908 |
| US-GAAP 2023 documentation linkbase | FASB taxonomy package | 288ed00809b3f84f62ee82c93db6f063d4db09bdc4ee6d1654207a1865ded5e7 |
| US-GAAP 2025 documentation linkbase | FASB taxonomy package | 27f1d4ba06b0dcb0c91225db2ac746d5adefc167518fa3948abbdfb944dab019 |

Source repositories were cloned at these exact commits:

| Repository | Commit | Role in the research |
|---|---|---|
| https://github.com/OpenFIGI/api-examples | f847dce9492a6bac685f9fdf1d9450e57280a9c4 | OpenFIGI request conventions and examples |
| https://github.com/edmcouncil/fibo | 119fa8c091aa4beece7d22aefa6fe138021a4355 | Issuer, instrument, listing, ticker, market, price, corporate-action, and rights vocabulary |
| https://github.com/bloomberg/blpapi-http | dc49f3ecdcb8b4807049129c998449c88bfcced2 | Bloomberg request/response and FieldInfo examples |
| https://github.com/msitt/blpapi-python | f4a164fac62c58be9ca2b989ddb6a0648170c895 | Current BLPAPI Python packaging/source corroboration only; not treated as Bloomberg organizational authority |

## Executive conclusion

Canonical financial-data linking is not a string-normalization problem and cannot safely be represented as:

~~~text
ticker → security → value
~~~

It requires at least:

~~~text
issuer or filer
  → issuer role
    → instrument or equity class
      → global share-class identity, where applicable
        → country or market composite, where applicable
          → venue-contextual instrument or listing
            → venue or pricing source
              → observation assertion
~~~

Each arrow needs provenance. Several need valid-time intervals. Observation values also need economic time, assertion or publication time, ingestion time, field-definition version, query parameters, and data-use rights.

The central design rule is:

> Never let a convenient alias silently become the identity of the thing.

Ticker, CIK, FIGI, composite FIGI, share-class FIGI, MIC, Bloomberg resolver strings, and provider field mnemonics answer different questions. They are not interchangeable identifiers for one universal “security” row.

## Four kinds of artifact that must not be conflated

### 1. Identity standard

FIGI 1.2 specifies:

- a persistent, semantically meaningless identifier syntax;
- uniqueness and non-reuse within the FIGI domain;
- metadata associated with identifiers;
- a three-level hierarchy for instruments where venue or pricing-source differentiation applies;
- a narrow ontological model for those concepts.

The standard explicitly places identifier-creation interfaces, operational infrastructure, and service-level agreements out of scope. OpenFIGI is therefore an operational mapping directory and API, not the FIGI standard itself.

FIGI 1.2 was formally adopted in March 2026. The official OMG page is:

https://www.omg.org/spec/FIGI/1.2

### 2. Data or query schema

Examples include:

- the OpenFIGI OpenAPI schema;
- Bloomberg BLPAPI service schemas and request/response shapes;
- Bloomberg BQL expressions;
- SEC Companyfacts, Companyconcept, Frames, and Submissions JSON.

These artifacts specify how to ask for and transport data. They do not by themselves create universal financial meaning. Two providers may expose similarly named fields while applying different adjustment, timing, scope, or estimation policies.

### 3. Ontology

FIBO supplies vocabulary and relations for:

- legal entities and issuer roles;
- financial instruments and securities;
- listings and exchanges;
- ticker and other identifier contexts;
- observed security prices and pricing sources;
- corporate actions;
- holder rights.

FIBO does not allocate FIGIs, resolve live identifiers, supply authoritative instance data, or grant access to vendor facts. Some of its market-data and corporate-action material is explicitly provisional.

### 4. Facts, assertions, and rights

SEC XBRL values are filer assertions carried by regulatory filings. The SEC XBRL Guide uses that exact conceptual framing; acceptance into EDGAR does not turn every number into an ontology axiom or independently verified truth.

Bloomberg reference, historical, real-time, security-master, and fundamental values are provider content accessed under entitlements and contract. BLPAPI is an access mechanism. A successful BLPAPI entitlement check means the user is permitted to consume particular service/EID content in that context; it does not independently establish rights to store, transform, display, or redistribute the data.

Open identity, public regulatory assertions, and licensed provider observations therefore require different rights treatment.

## Canonical identity layers

### Issuer or filer

The issuer is the party responsible for issuing an instrument. FIBO usefully models Issuer as a role played by a party, not as a synonym for the organization in all contexts.

SEC CIK identifies a filer/entity in EDGAR. It is not an instrument identifier. One CIK may report:

- common stock;
- multiple debt issues;
- preferred instruments;
- guarantees or co-registrant relationships;
- other disclosure entities within a filing.

CIK-to-legal-entity mapping is therefore a governed assertion, particularly for co-registrants and reorganizations.

### Instrument or issue

This is the economic or contractual claim: a particular bond, option, fund share, common-equity class, depositary receipt, or other instrument.

Instrument identity is distinct from:

- the party that issues it;
- a listing through which it is made tradable;
- the venue where it trades;
- a provider’s composite market view;
- an alias used to request it.

### Share class

For equities and funds, the FIGI Share Class Global Identifier acts as the global parent linking composite FIGIs representing the same class of the same instrument.

The FIGI allocation manual says share-class assignment applies to equities and funds and excludes warrants. It must not be made a required layer for all assets.

### Composite

A Composite Global Identifier groups venue-level FIGIs within a country or market, or may identify a jurisdiction-unbound aggregate. It applies only where venue or pricing-source differentiation is relevant.

A composite is not simply “the primary listing.” It is an aggregation scope. The allocation manual also documents multilateral trading facility cases whose FIGIs belong to an MTF-specific composite rather than the expected country composite.

### Listing or venue-contextual instrument

The basic Global Identifier is the most granular FIGI. Where applicable, it identifies a financial instrument in the context of a trading venue.

FIBO separately defines Listing as a catalog entry managed by an exchange, with listing date, optional delisting or last-trading time, currency, and listing terms. FIGI’s venue-contextual instrument and FIBO’s Listing are close but not demonstrably identical concepts. They should be related by an explicit crosswalk rather than declared equivalent with owl:sameAs.

### Venue and pricing source

MIC identifies exchanges, trading platforms, and certain reporting facilities. FIGI’s pricing-source notion is broader: it can apply where the source is not a trading venue.

OpenFIGI accepts micCode as a query filter, but its result schema returns exchCode, a Bloomberg exchange code. The result does not echo the MIC. A consumer that persists only the response loses part of the resolution evidence.

### Identifier assignment

Ticker, name, ISIN, CUSIP, SEDOL, exchange symbol, and provider resolver strings should be represented as assignments:

~~~text
IdentifierAssignment
  scheme
  value
  target
  scope
  valid_from
  valid_to
  asserted_at
  source
  evidence
  confidence or authority
~~~

The value is not the target. This distinction is what makes alias reuse, name changes, ticker changes, and conflicting providers representable.

## Why ticker alone fails

FIGI 1.2 explicitly says tickers are not unique to exchanges or pricing sources and that one ticker can be associated with multiple Global Identifiers.

FIBO independently classifies TickerSymbol as a ReassignableIdentifier:

- unique only within an exchange context;
- assigned for some period;
- reusable;
- potentially shared by exchanges.

FIBO specifically uses IBM as an example of a well-known symbol used by multiple exchanges.

Time makes the problem harder. The FIGI allocation manual says that after a ticker change:

- the FIGI remains attached to the instrument;
- the new ticker becomes current metadata;
- the old ticker is no longer associated with the FIGI.

The public OpenFIGI schema exposes no alias valid-from or valid-to dates and no mapping as-of parameter. OpenFIGI’s current directory cannot independently answer “what did this ticker identify on date T?”

Ticker plus exchange code is also not a universal key:

- The manual documents a Taiwan legacy case in which Taipei and Taiwan exchanges both used code TT.
- A true composite such as US has a composite code that is not a local venue.
- In a non-true composite market, composite and venue-level records can share ticker and exchange-code metadata.

Resolution must therefore return zero, one, or many candidates and expose identity level, venue/market scope, status, and evidence.

## IBM worked case

### The unconstrained result

On 2026-09-02, an exact OpenFIGI mapping request for:

~~~json
[
  {
    "idType": "TICKER",
    "idValue": "IBM"
  }
]
~~~

returned 86 current candidates in the captured response:

- 81 in marketSector Equity;
- 5 in marketSector M-Mkt.

The results include:

- many venue-level common-stock records sharing a global common-equity share-class FIGI;
- composite records across countries and markets;
- depositary receipts with different share-class identities;
- commercial-paper and medium-term-note programs without equity share-class FIGIs.

Ticker IBM therefore does not merely leave the venue unresolved. It can leave instrument type and economic claim unresolved.

The count is a retrieval-time observation, not a timeless FIGI property. The immutable response hash is recorded in the source header.

### Venue → composite → share class

Adding MIC XNYS to the exact-ticker request returned:

~~~yaml
figi: BBG000BLNQ16
name: INTL BUSINESS MACHINES CORP
ticker: IBM
exchCode: UN
compositeFIGI: BBG000BLNNH6
shareClassFIGI: BBG001S5S399
securityType: Common Stock
marketSector: Equity
~~~

This gives the concrete bottom-up identity path:

~~~text
NYSE venue-contextual FIGI
BBG000BLNQ16  IBM UN
       │ member of
       ▼
United States composite FIGI
BBG000BLNNH6  IBM US
       │ member of
       ▼
Global share-class FIGI
BBG001S5S399
~~~

The official allocation manual independently prints:

~~~text
Composite  IBM US  BBG000BLNNH6  composite BBG000BLNNH6
New York   IBM UN  BBG000BLNQ16  composite BBG000BLNNH6
~~~

It also lists multiple global composites connected by share-class FIGI BBG001S5S399, including London, Belgium, Germany, Mexico, Switzerland, Chile, and others.

The difference between US and UN is semantic:

- IBM US is the United States composite.
- IBM UN is the New York venue-level identity.
- XNYS is the standard MIC used to filter the venue.

Treating IBM US as “NYSE IBM” silently changes the observation scope.

### SEC entity and security disclosures

IBM’s SEC filer identity is:

~~~text
CIK 0000051143
International Business Machines Corporation
~~~

The 2025 10-K Inline XBRL contains the common-stock trading symbol IBM and New York Stock Exchange, but the same filing also contains separately listed debt symbols including IBM 26B, IBM 27B, IBM 27F, and others.

This proves at the filing level that one CIK is not one security.

### The cross-source edge is an assertion

Neither the OpenFIGI response nor SEC Companyfacts directly states:

~~~text
SEC CIK 0000051143 issues FIGI share class BBG001S5S399
~~~

That link is a cross-source integration assertion supported by:

- entity name;
- security title;
- ticker;
- venue;
- filing evidence;
- OpenFIGI hierarchy.

It should carry source records, asserted/retrieved time, matching method, and confidence or governance status. It is not evidence of Bloomberg’s internal company/security graph.

## Visualization-ready IBM model

### Nodes

~~~text
N1 FilerEntity
   identifier: SEC CIK 0000051143
   name: International Business Machines Corporation

N2 IssuerRole
   played_by: N1
   valid interval: explicit if known, otherwise unknown

N3 EquityClass
   identifier: FIGI share-class BBG001S5S399

N4 MarketComposite
   identifier: composite FIGI BBG000BLNNH6
   scope: United States

N5 VenueInstrument
   identifier: FIGI BBG000BLNQ16

N6 Venue
   identifier: MIC XNYS
   name: New York Stock Exchange

N7 IdentifierAssignment
   scheme: ticker
   value: IBM
   target: N5
   source: OpenFIGI
   observed_at: 2026-09-02
   valid_from/to: unavailable from OpenFIGI

N8 FieldDefinition
   provider
   service
   stable provider field ID
   mnemonic
   datatype
   documentation snapshot
   schema or catalog digest

N9 MarketObservationAssertion
   subject: N5 for venue data, or N4 for composite data
   field: N8
   value and unit/currency
   economic timestamp
   query-semantics record
   publication/assertion time if supplied
   retrieval time
   raw evidence
   entitlement and contractual-rights reference

N10 FilingFactAssertion
   subject: N1
   taxonomy concept URI and version
   value, unit, and decimals
   economic period
   dimensions
   accession and acceptance time
   retrieval time and content hash
~~~

### Edges

~~~text
N1 --plays--> N2
N2 --issues--> N3
    This is a governed cross-source assertion, not supplied by either API.

N5 --memberOf--> N4
    Documented by FIGI/OpenFIGI.

N4 --memberOf--> N3
    Documented by FIGI/OpenFIGI.

N5 --tradedAt--> N6
    Supported by the XNYS-filtered mapping and allocation rules.

N7 --identifiesDuring--> N5
    Current mapping is supported; historical validity is unavailable.

N9 --measures--> N5 or N4
    Scope must be explicit.

N10 --assertsAbout--> N1
    Filing fact is entity-level, not listing-level.
~~~

### Do not flatten

These are not one object:

~~~text
N1 ≠ N3 ≠ N4 ≠ N5 ≠ N6
~~~

An issuer-level Assets fact, a composite market price, and an XNYS venue quote can be connected in a graph, but they do not have the same subject.

## Observations, assertions, and vintages

### XBRL fact identity

The SEC XBRL Guide defines a fact as a filer assertion. Core dimensions include:

- concept;
- entity;
- reporting period;
- language for textual facts;
- unit for numeric facts;
- decimal significance;
- taxonomy-defined dimensions and members.

A default member may be unstated, and facts with explicit dimension members are distinct from aggregate facts. The guide also permits duplicate occurrences when their values are consistent under its rounding rules.

Consequently, an observation key cannot be only:

~~~text
entity + tag + date
~~~

It needs the full fact context and assertion provenance.

### Companyfacts is a lossy projection

The SEC API documentation states that Companyfacts and Companyconcept aggregate facts that:

1. use non-custom taxonomies; and
2. apply to the entire filing entity.

The projection is useful, but it omits:

- custom extension facts;
- full dimensional contexts;
- exact original XBRL contexts;
- per-assertion taxonomy-year URI;
- exact acceptance/dissemination timestamp in each fact row.

Companyfacts rows commonly expose:

~~~text
start
end
val
accn
fy
fp
form
filed
frame, sometimes
~~~

The accession must be joined to Submissions or filing metadata to recover acceptanceDateTime where available.

### Frames are a query policy

The SEC Frames API selects one last-filed fact per reporting entity that most closely matches a requested calendar frame.

For duration facts, calendar alignment permits approximately:

- 365 days ±30 for annual frames;
- 91 days ±30 for quarterly frames.

The SEC warns that reporting start and end dates can differ within a frame.

A frame is therefore a convenience-selection policy, not an intrinsic fact identity.

### IBM Assets revision

For IBM, concept us-gaap:Assets, unit USD, economic instant 2014-12-31:

~~~text
117,532,000,000
  accession 0001047469-15-001106
  form 10-K
  filed 2015-02-24

117,271,000,000
  accession 0001047469-16-010329
  form 10-K
  filed 2016-02-23
~~~

The first value was repeated in IBM’s 2015 Q1, Q2, and Q3 filings. The revised value subsequently appeared in a 2016 8-K and the 2017 10-K.

This is direct evidence that:

~~~text
(entity, concept, period, unit)
~~~

does not uniquely determine a value. A query must choose a vintage policy.

Supported policies should be named rather than hidden:

- exact accession or as-filed;
- as known at timestamp;
- latest filed assertion;
- latest accepted assertion;
- SEC frame selection;
- provider-specific restated or standardized policy.

Equal values are also distinct assertions. IBM’s Assets value for 2025-12-31 was:

~~~text
151,880,000,000 USD
~~~

and appeared in:

- accession 0000051143-26-000010, 10-K, filed 2026-02-24;
- accession 0000051143-26-000038, Q1 2026 10-Q;
- accession 0000051143-26-000078, Q2 2026 10-Q.

The value did not change, but the assertion events did.

### Taxonomy-version drift

IBM’s 2025 10-K extension schema imports:

~~~text
http://fasb.org/us-gaap/2025
~~~

The 2025 US-GAAP documentation defines Assets as:

~~~text
Amount of asset recognized for present right to economic benefit.
~~~

The captured Companyfacts response describes us-gaap:Assets with the older 2023 wording:

~~~text
Sum of the carrying amounts as of the balance sheet date of all assets that are recognized.
Assets are probable future economic benefits obtained or controlled by an entity as a
result of past transactions or events.
~~~

The observed mismatch does not prove why the SEC API selected that description. It does prove that the Companyfacts namespace/tag and top-level description are insufficient to recover the exact taxonomy definition governing a filing.

The concept key should therefore include:

~~~text
full namespace URI
local name
taxonomy package or version
taxonomy artifact digest
definition snapshot
~~~

### The four clocks

At minimum, retain four independent temporal axes:

1. **Identity valid time**  
   When a ticker, name, issuer role, listing, or mapping applied in the represented world.

2. **Economic observation time**  
   The market timestamp, instant, or duration to which a value applies.

3. **Event effective time**  
   When a corporate action, listing change, split, merger, or replacement became effective.

4. **Assertion and knowledge time**  
   When a source filed, accepted, published, disseminated, or supplied the assertion, and when the platform retrieved it.

Taxonomy and field-definition versions add a vocabulary-time axis. They should not be inferred from retrieval date.

## Bloomberg BLPAPI and field semantics

### Documentation provenance

The public BLPAPI index listed SDK 3.26.7 on the research date:

https://bloomberg.github.io/blpapi-docs/

The publicly linked Core Developer Guide is version 1.6 dated 2016-08-30. Stable request semantics from that guide are useful, but the age gap must be recorded. Current SDK/API pages and examples should corroborate current interfaces.

### Resolver strings are not canonical identity

For market-data topics, the guide documents:

- an optional symbology prefix;
- an instrument identifier;
- a default /ticker topic prefix.

IBM US Equity omits the prefix and therefore uses ticker resolution. It is a provider resolver string, not a globally canonical identifier.

The FIGI allocation manual establishes that IBM US is composite scope, while IBM UN is New York venue scope. A data system should persist:

- the original resolver;
- the resolved canonical identifier;
- identity level;
- resolution time and source;
- all ambiguity or fallback decisions.

### Current reference data

The guide says ReferenceDataRequest returns requested security/field values at that moment in time.

It also says:

- users with real-time entitlements receive current values;
- otherwise delayed values may be returned;
- static and real-time fields are distinct, even where equivalents exist.

Retrieval timestamp and entitlement context are therefore part of the observation’s provenance.

### Historical data is parameterized

HistoricalDataRequest requires securities, fields, and a date range. Its semantics may also depend on:

- calendarCodeOverride;
- currency;
- nonTradingDayFillOption;
- nonTradingDayFillMethod;
- periodicityAdjustment;
- periodicitySelection;
- maxDataPoints;
- pricingOption, such as price or yield;
- overrideOption, such as close or average;
- adjustmentFollowDPDF;
- adjustmentSplit;
- adjustmentAbnormal;
- adjustmentNormal;
- field-specific overrides.

Therefore:

~~~text
(security, field, date)
~~~

is not a reproducible observation key.

### DPDF is hidden user state unless made explicit

The guide documents adjustmentFollowDPDF with a default of true.

When true:

- the request follows the user’s Terminal DPDF settings;
- adjustmentSplit, adjustmentAbnormal, and adjustmentNormal are ignored.

When false:

- the explicit adjustment flags apply;
- no adjustment occurs if none is specified.

The adjustment categories include:

- stock splits and consolidations;
- spin-offs;
- stock dividends and bonus issues;
- rights offerings and entitlements;
- regular cash distributions;
- special cash and other abnormal adjustments.

Reproducible ingestion should not leave material semantics in mutable user defaults. Capture the effective settings and preferably set them explicitly.

### FieldInfo

FieldInfoRequest accepts a mnemonic or alphanumeric field identifier and can request documentation.

The public HTTP example for NAME returns:

- stable field ID DS002;
- mnemonic NAME;
- description;
- datatype;
- documentation;
- category;
- properties;
- overrides;
- field type.

A canonical field-definition record should therefore use:

~~~text
provider
service
stable provider field ID
mnemonic as alias
datatype
documentation
properties and allowed overrides
catalog or schema snapshot
retrieved_at
content digest
~~~

Mnemonic equality across providers does not prove semantic equivalence. Cross-provider field mapping is itself a governed assertion.

### Errors are nested

The Bloomberg HTTP guide notes that an HTTP response with status 0 and message OK may still contain:

- responseError;
- securityError;
- fieldExceptions;
- partial responses.

Transport success must not be modeled as semantic success. Preserve per-security and per-field errors.

## BQL: documented capability and inference boundary

Public Bloomberg material documents that BQL:

- selects universes and data items;
- performs calculations and aggregation server-side;
- supports parameterized queries;
- exposes point-in-time content in documented BQuant/product contexts.

An official Bloomberg index methodology contains BQL examples with:

- dates;
- currency;
- fill='PREV';
- ca_adj='SPLITS';
- capital_changes_adjust='SPLITS';
- fa_period_type='LTM';
- fa_filing_status='MRXP';
- as_of_date;
- server-side averages over date ranges.

BQuant materials describe curated point-in-time data, point-in-time corporate-structure navigation, and identifier mapping based on entitlements.

These public sources do not establish:

- a public exhaustive BQL grammar and field catalog;
- that every as_of_date parameter is universal knowledge-time travel;
- that BQL and BLPAPI mnemonics always share definitions;
- a single public model of Bloomberg’s internal entity/security/listing graph;
- universal revision timestamps or provenance for every result;
- internal mapping algorithms.

Those claims should be labeled unknown or proprietary, not stated as facts.

If a BQL query performs server-side aggregation, the query, parameters, universe definition, universe snapshot, and provider result must be retained. An aggregate without its selection context is not independently reproducible.

## Entitlements, licenses, and rights

### Bloomberg EIDs

Current public BLPAPI Identity documentation says an authorized Identity provides access to the entitlements of the validated user.

The API checks:

~~~text
user identity + service + entitlement ID set
~~~

and can report failed entitlement IDs.

This is a delivery-authorization mechanism. It does not, by itself, encode the customer contract governing:

- persistence;
- display;
- derived data;
- redistribution;
- sharing with another user or tenant;
- model training;
- export.

A data platform needs separate records for:

~~~text
EntitlementDecision
  subject or user
  service
  EID set
  decision
  decision time
  policy source

ContractualUsageRight
  content class
  permitted operations
  audience or tenant
  geography
  retention
  derivation rules
  redistribution rules
  effective interval
  agreement reference
~~~

### FIBO entitlement is a different concept

FIBO defines Entitlement as a financial instrument/right that gives its holder an interest in, a privilege to subscribe to, or a right to receive assets.

That must not be merged with a vendor data-access entitlement.

Use distinct names such as:

~~~text
HolderEconomicRight
DataAccessEntitlement
ContractualUsageRight
~~~

### FIGI openness does not grant Bloomberg data rights

A FIGI can be used as an open linking identifier. That does not grant rights to the Bloomberg field values, mappings, classifications, prices, or reference data attached to it in commercial products.

Identity provenance and content-license provenance are separate.

## Corporate actions

### FIGI persistence rules

The allocation manual documents:

- FIGIs are never reused.
- Existing FIGIs do not change because of a corporate action.
- A ticker change leaves FIGI intact and replaces the current ticker metadata.
- A name change leaves FIGI intact.
- Delisted venue and composite FIGIs continue to exist.
- In a merger or acquisition, existing A and B FIGIs remain.
- A newly created spin-off entity receives a new FIGI.
- An exchange-offer replacement instrument receives a new FIGI while the original retains its FIGI.
- Fungible bonds have distinct pre-funge FIGIs; both identifiers persist after the funge.

### When-issued nuance

When-issued behavior shows why the rule must be modeled carefully:

- A sequential when-issued to regular-way transition can be treated as a ticker change, retaining the original FIGIs.
- A concurrent when-issued instrument trading alongside regular-way shares has distinct FIGIs, which remain after it delists.

“Corporate actions never change FIGI” means an allocated identifier is persistent. It does not mean a corporate action can never create a new instrument and new FIGI.

### Corporate-action model

Represent a corporate action as its own occurrence:

~~~text
CorporateAction
  action type
  announced_at
  ex_time
  record_time
  election deadline
  pay_time
  effective_time
  source assertions
  applies_to issuer/instrument/listing
  creates
  replaces
  retires or delists
  renames
  changes alias assignment
  adjustment factors
~~~

Price observations should state whether and how the action was incorporated. Raw, split-adjusted, dividend-adjusted, and rights-adjusted series are different derived observations even when they use the same provider mnemonic.

## FIBO findings

At commit 119fa8c091aa4beece7d22aefa6fe138021a4355:

### Strong, useful concepts

- FinancialInstrument is a contract-like economic object.
- Security is a tradable financial instrument.
- Issuer is a role.
- A financial instrument is issued by an issuer role.
- A financial-instrument identifier is unique for some purpose and within a specified context.
- Listing is an exchange-managed catalog entry for an offering.
- ListedSecurity relates the security to listing and home/original exchanges.
- TickerSymbol is reassignable and exchange-contextual.
- Exchange is a market facility distinct from its manager.
- MIC identifies exchanges, platforms, and reporting facilities.
- SecurityPrice can refer to a security, observed time, and pricing source.
- AdjustedClosingPrice explicitly accounts for splits, dividends, and rights.
- Corporate Action is an occurrence that may apply to a legal entity or security.

### Limits

The FIBO Market Data domain states that it is provisional and had not undergone serious review or integration with other FIBO areas as of Q1 2026.

The detailed Security-related Corporate Actions ontology is also marked Provisional.

FIBO is valuable as a semantic vocabulary and source of distinctions. It should not be copied wholesale as a production observation store without:

- local identity constraints;
- explicit bitemporal assertion modeling;
- source provenance;
- query-policy records;
- rights controls;
- validation against actual provider payloads.

## Resolution and observation contracts

### Resolve

~~~text
resolve(
  identifier_scheme,
  identifier_value,
  desired_identity_level,
  venue_mic?,
  exchange_code?,
  country_or_market_scope?,
  security_type?,
  valid_at?,
  include_inactive?,
  source
) → ResolutionResult
~~~

ResolutionResult should contain:

~~~text
candidates: 0..n
each candidate:
  canonical target
  identity level
  matched assignment
  venue/market scope
  active or inactive status
  valid interval if known
  source
  retrieved_at
  evidence digest
  warnings
  confidence or authority
~~~

Rules:

- Never silently return the first candidate.
- Never erase ambiguity.
- An exact ticker string is not an exact entity match.
- If valid_at is requested but the source lacks history, return an explicit unsupported or incomplete-history condition.
- Preserve the request because filters such as MIC may not be present in the response.

### Observe

~~~text
observe(
  subject_at_explicit_identity_level,
  field_or_concept_definition_version,
  economic_period,
  as_known_at_or_accession,
  dimensions,
  unit_or_currency,
  periodicity,
  calendar,
  fill_policy,
  corporate_action_policy,
  overrides,
  source,
  entitlement_context
) → ObservationAssertions
~~~

Each assertion should retain:

~~~text
subject reference and level
measure/field/concept reference
value and datatype
unit/currency
economic instant or duration
dimensions
source assertion or publication time
retrieved_at
source record and raw digest
complete normalized query semantics
provider error/warning state
rights reference
supersedes or restates relation, if known
~~~

### Field equivalence

Provider-to-provider field equivalence should be a first-class assertion:

~~~text
FieldMappingAssertion
  source field definition
  target field definition
  relation:
    exact
    broader
    narrower
    transformable
    not comparable
  transform
  assumptions
  valid interval
  evidence
  reviewer/governance state
~~~

Matching labels or mnemonics are insufficient.

## Worked observation records

### Issuer-level filing fact

~~~yaml
kind: FilingFactAssertion
subject:
  kind: FilerEntity
  identifier:
    scheme: SEC_CIK
    value: "0000051143"
measure:
  concept_uri: http://fasb.org/us-gaap/2025#Assets
  taxonomy_package: US-GAAP-2025
value:
  amount: 151880000000
  unit: USD
economic_time:
  kind: instant
  end: 2025-12-31
source:
  accession: 0000051143-26-000010
  form: 10-K
  filed: 2026-02-24
  accepted_at: 2026-02-24T21:07:07Z
retrieval:
  date: 2026-09-02
  companyfacts_sha256: 1660477fa5713e5749c3038cf22b3c776414acfc6e1e721d1772c91101dc5e5c
notes:
  - Subject is the filer/entity, not the share class or listing.
  - Exact raw XBRL context and decimals should be retained from the filing instance.
~~~

### Market observation template

~~~yaml
kind: MarketObservationAssertion
subject:
  kind: VenueInstrument
  identifier:
    scheme: FIGI
    value: BBG000BLNQ16
  venue:
    scheme: MIC
    value: XNYS
resolver_evidence:
  ticker: IBM
  openfigi_retrieved_at: 2026-09-02
measure:
  provider: Bloomberg
  service: //blp/refdata
  field_id: resolve with FieldInfo
  mnemonic: PX_LAST
value:
  amount: provider response value
  currency: explicit request/result currency
economic_time:
  date_or_timestamp: explicit
query_semantics:
  periodicity: explicit
  calendar: explicit
  fill: explicit
  adjustmentFollowDPDF: false
  adjustmentSplit: explicit
  adjustmentNormal: explicit
  adjustmentAbnormal: explicit
  overrides: complete list
provenance:
  raw_request_digest: required
  raw_response_digest: required
  field_definition_digest: required
  retrieved_at: required
rights:
  service: //blp/refdata
  eids: returned or checked EIDs
  contractual_usage_right: separate policy reference
~~~

No Bloomberg market value is asserted in this worked record because the research did not use an entitled Bloomberg data session. Public documentation examples are documentation fixtures, not independently verified market observations.

## Documented facts versus inference about Bloomberg

### Documented

- IBM US Equity is valid ticker-style resolver syntax with an implied /ticker prefix.
- Reference data can be current or delayed according to entitlements.
- Historical requests support the enumerated calendar, currency, fill, periodicity, quote, and adjustment parameters.
- DPDF can inject user-specific adjustment settings.
- FieldInfo exposes provider field identifiers and documentation.
- Responses contain per-security EIDs and nested errors/exceptions.
- Identity entitlement checks are scoped to service and EID set.
- BQL examples show parameterized, server-side computation and documented point-in-time/corporate-action controls in specific contexts.
- Bloomberg offers commercial point-in-time company/security-master datasets.

### Design inference, explicitly labeled

- Bloomberg likely maintains richer internal issuer/security/listing relationships than public OpenFIGI output exposes. The exact internal model was not established.
- Resolving IBM US Equity to composite FIGI BBG000BLNNH6 is a cross-source integration conclusion supported by FIGI allocation material, not a BLPAPI response field demonstrated here.
- A platform should normalize BLPAPI and BQL requests into a shared semantic query record. Public sources do not prove that Bloomberg internally does so.
- A BQL as_of_date may act as a knowledge-time selector for a documented dataset, but universal bitemporal semantics were not established.
- EIDs should be preserved alongside observations, but contractual rights must come from the agreement rather than inferred from EIDs.

## Contradictions and gaps

### FIGI 1.2 prefix inconsistency

The conformance table excludes first-two-character sequences:

~~~text
BS, BM, GG, GB, VG
~~~

The syntax section and normative Turtle regex additionally exclude:

~~~text
GH, KY
~~~

This is an apparent internal erratum. A validator should version its rule set, record which normative artifact it follows, and verify disputed cases against the Registration Authority rather than silently selecting a rule.

### OpenFIGI temporal and provenance gap

The captured schema exposes no:

- issuer identifier;
- mapping as-of date;
- ticker/name valid interval;
- mapping assertion timestamp;
- MIC in the result;
- mapping confidence or source lineage.

It is a current discovery service, not a bitemporal security master.

### FIGI/FIBO alignment gap

FIGI’s three identifier levels all identify a financial instrument in different contexts. FIBO more sharply separates security, listing, and exchange.

A production ontology needs an explicit crosswalk. Treating FIGI venue-level identity as exactly identical to FIBO Listing would overstate what the sources establish.

### SEC aggregation gap

Companyfacts makes standard, entity-wide facts convenient, but:

- filters out custom facts;
- omits full dimensions;
- collapses taxonomy-year identity in the JSON key;
- may expose a description that differs from the filing’s imported taxonomy version.

Raw filing artifacts remain necessary for audit-grade meaning.

### Bloomberg public-documentation gap

- The Core Developer Guide is older than the current SDK.
- The complete field catalog is runtime/product-accessed rather than publicly versioned.
- Public BQL materials do not establish universal revision semantics.
- Public sources do not expose Bloomberg’s complete internal identifier hierarchy or mapping algorithms.
- Entitlement checks do not encode the complete license.

### FIBO maturity gap

Useful core concepts are mature, but the Market Data domain and detailed security-related corporate-action ontology carry explicit provisional status.

## Compact evidence records

### E1 — FIGI hierarchy

**Status:** Documented fact  
**Claim:** Venue-level Global Identifier is the most granular FIGI; Composite groups venue/pricing-source FIGIs; Share Class groups composites globally.  
**Primary source:** https://www.omg.org/spec/FIGI/1.2/PDF  
**Machine source:** https://www.omg.org/spec/FIGI/20240801/FIGI-1.2-TurtleSerializedOWL/GlobalInstrumentIdentifiers.ttl  
**Local evidence:** FIGI-1.2.txt lines beginning 665; GlobalInstrumentIdentifiers-1.2.ttl classes at lines beginning 111, 262, and 346.  
**Implication:** Identity level must be stored with every FIGI.

### E2 — Ticker ambiguity and time

**Status:** Documented fact  
**Claim:** Tickers are non-unique; FIBO treats them as exchange-contextual and reassignable; OpenFIGI replaces old ticker metadata after change.  
**Sources:** FIGI 1.2 §6.2.6; FIBO SecuritiesIdentification.rdf at commit 119fa8c; FIGI allocation rules §3.2.1.  
**Implication:** Ticker is an IdentifierAssignment, not a primary key.

### E3 — IBM FIGI chain

**Status:** Documented fact plus live snapshot  
**Claim:** BBG000BLNQ16 → BBG000BLNNH6 → BBG001S5S399 represents NYSE venue → US composite → global share class.  
**Sources:** FIGI allocation rules §2.2.4 and §4.1.1; captured XNYS mapping response.  
**Implication:** IBM US and IBM UN are different data scopes.

### E4 — OpenFIGI schema limits

**Status:** Direct schema observation  
**Claim:** micCode is an input filter; result exposes exchCode but no MIC, issuer ID, alias validity, or as-of mapping parameter.  
**Source:** https://api.openfigi.com/schema  
**Artifact SHA:** d83fbc4ad3053c23684ec9c9b24e667d61ef1022e1d98456252f8cba3159d520  
**Implication:** Persist requests and add a separate provenance/temporal layer.

### E5 — BLPAPI observation semantics

**Status:** Documented fact  
**Claim:** Reference values may be current or delayed; historical results depend on calendar, currency, fill, periodicity, quote, DPDF, and adjustment parameters.  
**Sources:** BLPAPI Core Developer Guide §§4 and 15.4.  
**Implication:** Query semantics are part of observation identity.

### E6 — Bloomberg field definitions

**Status:** Documented fact  
**Claim:** FieldInfo resolves mnemonic or alphanumeric ID and returns field metadata/documentation.  
**Source:** https://github.com/bloomberg/blpapi-http/blob/dc49f3ecdcb8b4807049129c998449c88bfcced2/doc/http-api-guide.md#L226-L269  
**Implication:** Snapshot the provider field definition; do not treat mnemonic alone as stable semantics.

### E7 — Bloomberg entitlements

**Status:** Documented fact  
**Claim:** Authorization is evaluated for a user Identity, service, and EID set.  
**Source:** https://bloomberg.github.io/blpapi-docs/cpp/3.26.3/classBloombergLP_1_1blpapi_1_1Identity.html  
**Implication:** Preserve entitlement evidence, but use contract data for usage rights.

### E8 — SEC fact semantics

**Status:** Documented fact  
**Claim:** An EDGAR XBRL fact is a filer assertion characterized by concept and contextual dimensions.  
**Source:** SEC EDGAR XBRL Guide, 2026-06-29, §1.  
**Implication:** Store assertions and contexts, not only normalized values.

### E9 — IBM vintage revision

**Status:** Direct data observation  
**Claim:** IBM Assets at 2014-12-31 appears as both 117.532B and 117.271B USD in different filing vintages.  
**Source:** Captured IBM Companyfacts response.  
**Artifact SHA:** 1660477fa5713e5749c3038cf22b3c776414acfc6e1e721d1772c91101dc5e5c  
**Implication:** Latest, as-filed, and as-known-at are distinct query policies.

### E10 — Taxonomy-version mismatch

**Status:** Direct artifact comparison  
**Claim:** IBM imports US-GAAP 2025, while Companyfacts exposes the older 2023 Assets description.  
**Sources:** IBM extension schema; FASB 2023 and 2025 documentation linkbases; Companyfacts.  
**Implication:** Key concepts by full versioned namespace/package evidence.

### E11 — FIBO listing and ticker

**Status:** Documented ontology content  
**Claim:** Listing is an exchange-managed entry with temporal properties; ticker is reassignable and exchange-contextual.  
**Sources:**  
https://github.com/edmcouncil/fibo/blob/119fa8c091aa4beece7d22aefa6fe138021a4355/SEC/Securities/SecuritiesListings.rdf  
https://github.com/edmcouncil/fibo/blob/119fa8c091aa4beece7d22aefa6fe138021a4355/SEC/Securities/SecuritiesIdentification.rdf  
**Implication:** Keep instrument, listing, venue, and alias as separate nodes.

### E12 — Rights collision and FIBO maturity

**Status:** Documented ontology content  
**Claim:** FIBO Entitlement is a holder economic right; FIBO Market Data and detailed security corporate-action material are provisional.  
**Sources:** FIBO FinancialInstruments.rdf, MetadataMD.rdf, and SecurityRelatedCorporateActions.rdf at commit 119fa8c.  
**Implication:** Separate holder rights, data-access entitlements, and contractual usage rights; do not adopt provisional modules uncritically.

## Reproducibility ledger

All local artifacts are under:

~~~text
/private/tmp/zoen-openbb-deep.0N6mfl/finance-lane
~~~

### Repository commits

~~~text
openfigi-api-examples
f847dce9492a6bac685f9fdf1d9450e57280a9c4

fibo
119fa8c091aa4beece7d22aefa6fe138021a4355

blpapi-http
dc49f3ecdcb8b4807049129c998449c88bfcced2

blpapi-python
f4a164fac62c58be9ca2b989ddb6a0648170c895
~~~

### Key local files

~~~text
FIGI-1.2.pdf
FIGI-1.2.txt
GlobalInstrumentIdentifiers-1.2.ttl
figi-allocation-rules.pdf
figi-allocation-rules.txt
openfigi-schema.json
openfigi-ibm-mapping.json
openfigi-ibm-xnys.json
BLPAPI-Core-Developer-Guide.pdf
BLPAPI-Core-Developer-Guide.txt
BQuant-Enterprise-Equity-Quant-Jan-24-2.pdf
BQuant-Enterprise-Equity-Quant-Jan-24-2.txt
SEC-EDGAR-XBRL-Guide-2026-06-29.pdf
SEC-EDGAR-XBRL-Guide-2026-06-29.txt
sec-ibm-companyfacts.json
sec-ibm-submissions.json
ibm-20251231.htm
ibm-20251231.xsd
us-gaap-doc-2023.xml
us-gaap-doc-2024.xml
us-gaap-doc-2025.xml
us-gaap-2026.zip
~~~

### Principal checksums

~~~text
FIGI-1.2.pdf
e932920edc3d95fd75f3240a6f02ef31984fe02a7d26625d51a603fe25809962

GlobalInstrumentIdentifiers-1.2.ttl
b47c055727f32e3dcd134bb61c6c2f0847c0addbf096655b1f826f0a03bc0a2a

figi-allocation-rules.pdf
b9f12e02140ca1d82e724c108f7bd304adefe97cb860eb9319ce603ed9d621a2

BLPAPI-Core-Developer-Guide.pdf
2c8d73815e9e468a72d2476237f00bff3854d99995de132a97945ddbfd0888c6

openfigi-schema.json
d83fbc4ad3053c23684ec9c9b24e667d61ef1022e1d98456252f8cba3159d520

openfigi-ibm-mapping.json
9ab2abd1fa8ea5603465e57c92bcb6a521721bf75affca9c6632a54f53587e17

openfigi-ibm-xnys.json
b36837a63a6837e9e034585e738b237fb8e5a198086f5396da621f1a2c74215b

SEC-EDGAR-XBRL-Guide-2026-06-29.pdf
1dce8479705ec1f8737d421e69a439d606d232f26e46338634cb4444b7dd3b86

sec-ibm-companyfacts.json
1660477fa5713e5749c3038cf22b3c776414acfc6e1e721d1772c91101dc5e5c

sec-ibm-submissions.json
0d698f754c7aa7f9373bc90b65d73d801e018ad176b6ffb5e4ec0f6d18fa984f

ibm-20251231.htm
d4669e1c5c4536b8297cc3c8d3366129d3fc8acf39f968f1c68dd29ebe03b86a

ibm-20251231.xsd
5319871e1670261aa8b7891475b6e3a8785b6b99cf57b68eee54514bb4d55908

us-gaap-doc-2023.xml
288ed00809b3f84f62ee82c93db6f063d4db09bdc4ee6d1654207a1865ded5e7

us-gaap-doc-2025.xml
27f1d4ba06b0dcb0c91225db2ac746d5adefc167518fa3948abbdfb944dab019
~~~

## Limitations

- The OpenFIGI counts are a 2026-09-02 operational snapshot and can change.
- The research did not use a logged-in Bloomberg Terminal, B-PIPE, Data License, or BQuant session.
- No live licensed Bloomberg fact is asserted.
- BLPAPI public documentation is uneven in age; the current SDK index and API pages were used to bound older guide material.
- Bloomberg internal identifier resolution, security master, field catalog history, and BQL implementation are proprietary and were not inferred beyond public evidence.
- SEC Companyfacts is not a substitute for raw Inline XBRL and taxonomy packages.
- FIBO provides vocabulary, not authoritative instance data; provisional modules require local design review.
- The IBM issuer-to-share-class edge is an evidence-backed integration assertion, not a relationship directly returned by SEC or OpenFIGI.
- FIGI hierarchy varies by asset class; composite and share-class layers must remain optional.

## Final design implications

The coherent financial ontology should:

1. Separate party/filer, issuer role, instrument, share class, composite, venue instrument/listing, and venue.
2. Represent aliases as time-scoped source assertions.
3. Make identity level explicit on every canonical identifier.
4. Return ambiguity rather than hiding it.
5. Store observations as assertions with complete provenance.
6. Keep economic time, identity valid time, event effective time, and knowledge/retrieval time separate.
7. Version field and taxonomy definitions.
8. Preserve complete query semantics, especially adjustment, calendar, fill, currency, periodicity, and vintage policy.
9. Model corporate actions as events that may change aliases, create instruments, or alter derived series without reusing FIGIs.
10. Separate holder economic rights, access entitlements, and contractual usage rights.
11. Distinguish documented provider behavior from cross-source integration inference.
12. Treat OpenFIGI, SEC APIs, Bloomberg services, and FIBO as complementary layers, never as interchangeable sources of truth.

For IBM, this means the graph must be able to say all of the following without contradiction:

~~~text
CIK 0000051143 identifies the SEC filer.
BBG001S5S399 identifies a global equity share-class scope.
BBG000BLNNH6 identifies the United States composite scope.
BBG000BLNQ16 identifies the XNYS venue-contextual instrument.
IBM is a current alias, not the canonical object.
An Assets fact is about the filer/entity.
A venue price is about the venue-contextual instrument.
A composite price is about the composite scope.
The links among these claims have sources, time, and rights.
~~~
