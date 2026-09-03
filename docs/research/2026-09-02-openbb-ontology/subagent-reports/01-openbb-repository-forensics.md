# OpenBB Repository Forensics: Runtime, Contracts, Surfaces, and Public/Private Boundary

**Subagent role:** repository-forensics research lane for the OpenBB ontology deep dive  
**Research date:** 2026-09-02  
**Scope:** public OpenBB repositories relevant to the Open Data Platform (ODP), providers, standard models, generated SDK/REST/MCP/widget surfaces, Workspace integration, agent protocols, authentication/entitlement, caching, persistence, identifiers, provenance, and licensing.  
**Excluded:** unverifiable implementation claims about the closed/unreleased Workspace frontend, hosted Workspace MCP, built-in Copilot, or Excel Add-in.  
**Primary-source policy:** pinned repository code and official OpenBB/GitHub pages only. Product documentation is treated as behavioral evidence, not implementation evidence.

## Executive findings

1. OpenBB's public ODP is a compositional Python runtime, not a single fixed API. Installed Python entry points load routers, providers, and OBBject extensions; the same graph generates a Python SDK, REST endpoints, an ODP MCP server, and Workspace widget definitions.
2. Provider interchange is real but deliberately permissive. Standard Query/Data models provide a shared core, while provider-specific fields are merged into optional extras and Pydantic accepts additional fields. This is useful interoperability, not a closed-world governed ontology.
3. In the complete checked-in entry-point universe there are **32 providers, 350 provider-model registrations, 202 unique model IDs, 278 declared command routes, and 277 runtime-eligible command routes**. The ordinary non-optional `openbb` install is materially smaller: **17 providers, 266 registrations, 180 model IDs, 210 declared routes, and 193 eligible routes**.
4. The exact provider-count distribution is **134 models with 1 provider, 32 with 2, 13 with 3, 12 with 4, 5 with 5, 4 with 6, none with 7, and 2 with 8**. Thus **134/202 = 66.34%** are single-provider and **68/202 = 33.66%** are multi-provider. The histogram independently sums to 202 models and 350 provider-model pairs.
5. Route identity is unusually coherent across machine surfaces: a REST path becomes an underscore-separated ODP MCP tool ID and widget route ID. The audited tree has **zero path-to-underscore collisions** and **zero derived base-widget-ID collisions**. Identity becomes less stable after the widget catalog boundary, where provider suffixes, widget instance UUIDs, and fresh citation UUIDs appear.
6. OBBject records the selected provider and can carry invocation metadata and arbitrary provider metadata, but it does **not** require upstream URL, dataset/version, record retrieval time, source license, entitlement decision, evidence ID, or a lineage graph. Product claims of governed lineage therefore depend on Workspace code that was not public at audit time.
7. Three MCP implementations/contracts must not be conflated:
   - **ODP MCP:** open-source FastAPI-to-FastMCP conversion with optional local Basic-style authentication.
   - **Hosted Workspace MCP:** documented hosted PAT endpoint relayed through an open Workspace browser session; implementation not public.
   - **Rita's Workspace bridge:** public proof of concept with in-memory sessions and a first-connected-browser default; useful protocol evidence, not production implementation evidence.
8. On 2026-08-25 OpenBB announced a commitment to release Workspace, ODP, Copilot, and the Excel Add-in under a permissive license, while explicitly saying release order and timing would follow. On 2026-09-02 those product repositories were still absent from the live 42-repository public org inventory. The pinned ODP repository remained AGPL-3.0.

## Pins and durable citation convention

The repositories were cloned with `--depth 1`. Citations of the form `Repo@SHA:path:Lx-Ly` identify exact lines at the listed commit and can be expanded to:

`https://github.com/OpenBB-finance/<Repo>/blob/<SHA>/<path>#Lx-Ly`

For example, `OpenBB@3e071…:openbb_platform/core/openbb_core/app/extension_loader.py:L17-L31` maps to the immutable GitHub blob at commit `3e071fcc2cd9f891cac6040ae60296dba76dab46`.

### Cloned repository and license inventory

| Repository | Pinned SHA | Branch; HEAD date | Relevance/status | Root license at pin |
|---|---|---|---|---|
| `OpenBB` | `3e071fcc2cd9f891cac6040ae60296dba76dab46` | `develop`; 2026-07-20 | Current ODP core, providers, routers, REST, ODP MCP, widget compiler | **AGPL-3.0**, `LICENSE:L1-L3` |
| `openbb-docs` | `acd5b2bf2d8603f574bd6b2da2e15e1aae8b017d` | `main`; 2026-08-24 | Platform and product contracts; not Workspace implementation | MIT, `LICENSE:L1-L3` |
| `backends-for-openbb` | `a6293707576e16edda8305adda95b07b6a4b968b` | `main`; 2026-07-16 | Workspace backend, widget, and iframe examples | MIT, `LICENSE:L1-L3` |
| `openbb-ai` | `9a2f0991002cd48d2d0bc5606498b52167a1c6fc` | `main`; 2026-08-18 | BYO-agent SDK and Workspace wire models | MIT, `LICENSE:L1-L3` |
| `agent-rita` | `f673c1fbeeeedfdbf4a253031d85eb8e96538924` | `main`; 2026-08-26 | Current reference agent and PoC Workspace MCP bridge | MIT, `LICENSE:L1-L3` |
| `agents-for-openbb` | `aa1073d2b098ae6cf597dabf0635822aa808dd81` | `main`; 2026-07-01 | Agent examples | MIT, `LICENSE:L1-L3` |
| `openbb-docs-mcp` | `fa7b496dff2394a2b085d8f6e6af5e55dc91f57e` | `main`; 2026-08-24 | Documentation retrieval MCP, not Workspace operational MCP | MIT, `LICENSE:L1-L3` |
| `openbb-cookiecutter` | `538c4780130589ea4bb4da1e3a10337e9b58c1f8` | `main`; 2025-10-23 | Third-party router/provider extension template | MIT, `LICENSE:L1-L3` |
| `openbb-snaptrade` | `5edc96b406a85b7afde2bd357ce10af37f97cd6e` | `main`; 2026-08-24 | Authenticated Workspace app/MCP reference integration | MIT, `LICENSE:L1-L3` |
| `openbb-brightquery` | `f5c9181aad4d86119a54a9e03c79bb110a207914` | `main`; 2026-08-24 | Public Workspace app/backend example | MIT, `LICENSE:L1-L3` |
| `openbb-platform-pro-backend` | `2c7905c092ec38d2b80de17efb27c95680122c22` | `main`; 2026-08-24 | Older OpenAPI-to-`widgets.json` wrapper, superseded in-tree | MIT, `LICENSE:L1-L3` |
| `design-system` | `8a35011409a58bc021660ead5fd36db9944e0d3a` | `main`; 2026-08-24 | React component library only, not Workspace product source | MIT, `LICENSE:L1-L3` |
| `widgets-library` | `31378c4c71ce0c591de7ae398061bcd2ca1f7b85` | `main`; 2026-08-24 | Image/catalog relic; README calls its former flow deprecated | MIT, `LICENSE:L1-L3`; `README.md:L1-L12` |
| `examples` | `01ccc445bd8cf5b9e0a9992f10b460fd79500e63` | `main`; 2026-08-24 | Version-specific notebooks/routines; README disclaims future compatibility | MIT, `LICENSE:L1-L3`; `README.md:L1-L5` |
| `awesome-openbb` | `11d03e922a88dd434a9793550d5230f23f40a8a8` | `main`; 2026-06-29 | Ecosystem index | MIT, `LICENSE:L1-L3` |
| `experimental-openbb-platform-agent` | `1cfee33dc8443a9507698fc13c2c4eba88a03211` | `main`; 2024-07-22 | Stale work-in-progress predecessor | **No root license detected**; `README.md:L1-L7` |
| `pywry` | `82c85ddababb089df1cbb752a7c7b2c608606168` | `main`; 2023-11-01 | Archived optional chart-window dependency | MIT, `LICENSE:L1-L3`; GitHub API `archived=true` |

Provider/extension packages inside `OpenBB` also declare `AGPL-3.0-only` in their individual manifests; for example `OpenBB@3e071…:openbb_platform/providers/yfinance/pyproject.toml:L1-L20` and `openbb_platform/obbject_extensions/charting/pyproject.toml:L1-L7`.

## Methodology

### Repository discovery

- Queried `https://api.github.com/orgs/OpenBB-finance/repos?per_page=100&type=public` on 2026-09-02.
- The live response contained exactly **42** public repositories:

  `.github`, `BenchmarkForecast`, `DiscordBot`, `GamestonkTerminalGuide`, `LegacyCLI`, `OpenBB`, `OptionPricingModels`, `agent-rita`, `agents-for-openbb`, `awesome-openbb`, `backends-for-openbb`, `bls-app`, `cftc-app`, `design-system`, `eia-app`, `examples`, `experimental-openbb-platform-agent`, `google_workspace_mcp`, `hackathon`, `hsdl-app`, `landing-page`, `linqalpha-workshop`, `openbb-ai`, `openbb-bot`, `openbb-brightquery`, `openbb-cookiecutter`, `openbb-docs`, `openbb-docs-mcp`, `openbb-docs-old`, `openbb-forecast`, `openbb-kalshi-app`, `openbb-metricsv2`, `openbb-outsampler`, `openbb-platform-pro-backend`, `openbb-simudyne-demo`, `openbb-snaptrade`, `polymarket-app`, `pytest_recorder`, `pywry`, `test-gitflow`, `uptime`, `widgets-library`.
- `google_workspace_mcp` is a fork concerning Google Workspace and is unrelated to OpenBB Workspace.
- Live GitHub repository API requests returned HTTP 404 for all six plausible product names: `workspace`, `workspace-mcp`, `openbb-workspace`, `openbb-copilot`, `openbb-excel`, and `excel-addin`.
- A cached search/org surface had advertised `workspace-mcp`, but `git ls-remote https://github.com/OpenBB-finance/workspace-mcp.git HEAD` and the live GitHub API both returned not found. The live API/clone result is treated as authoritative for source availability.

### Static code audit

The reproducible audit parsed every `pyproject.toml` below `OpenBB/openbb_platform` and every Python AST in that tree. It:

1. enumerated `openbb_provider_extension`, `openbb_core_extension`, `openbb_obbject_extension`, and `openbb_charting_extension` declarations;
2. parsed each `Provider(fetcher_dict=…)` to form exact `(provider, model)` pairs and credential declarations;
3. resolved nested `Router.include_router` imports, including relative imports;
4. walked `@router.command` decorators, default paths, explicit paths, models, and HTTP methods;
5. mirrored `SignatureInspector.complete`: model-backed routes with no installed provider are skipped, while model-less routes remain;
6. reproduced path-to-widget/MCP underscore normalization and provider-suffixed widget IDs;
7. separated non-optional dependencies in `openbb_platform/pyproject.toml` from the all-extras checked-in universe;
8. asserted count conservation and collision absence.

The final assertions were:

```text
provider_count                                      = 32
default_install_provider_count                      = 17
provider_model_pairs                                = 350
unique_provider_model_ids                           = 202
statically_resolved_declared_routes                 = 278
runtime_eligible_routes                             = 277
default_install_runtime_eligible_command_routes     = 193
default_mcp_candidate_http_routes                   = 216
derived_widget_instance_count_before_filters/clones = 425
route_path_collisions                               = 0
route_to_underscore_id_collisions                   = 0
derived_widget_instance_id_collisions               = 0
```

This is a source-tree/installation-model audit, not a booted production deployment. Upstream service availability, runtime configuration, transitive packages, persisted widget overrides, and closed Workspace behavior are outside those counts.

## Release and public/private source boundary

| Claim | Evidence | Observed result | Confidence | Limitation/contradiction |
|---|---|---|---|---|
| The full suite is announced for future permissive open-sourcing, not fully published. | [OpenBB belongs to everyone, 2026-08-25](https://openbb.co/blog/openbb-belongs-to-everyone/) | The announcement names Workspace, ODP, Copilot, and Excel Add-in, then says order/timing will be shared as release work completes. | High | Six likely product repo names were absent/404 on 2026-09-02. Pinned ODP still says AGPL-3.0. |
| Hosted Workspace MCP is a released service. | [Introducing Workspace MCP, 2026-05-26](https://openbb.co/blog/introducing-workspace-mcp/); `openbb-docs@acd5…:content/agents/workspace-mcp-overview.md:L19-L34,L44-L84,L115-L126` | Hosted `/mcp`, PAT authorization, browser relay, Workspace resources and actions are documented. | High for behavior | No public hosted implementation source was retrievable. |
| Workspace and built-in Copilot were shipped products. | [OpenBB Copilot is now available](https://openbb.co/blog/openbb-copilot-is-now-available/) | The blog's linked open-source repository is for making one's own Copilot accessible in Workspace, matching `openbb-ai`/agent reference code. | High for product status | It is not source for the built-in Copilot or Workspace UI. |
| Dynamic Excel widget formulas shipped. | [OpenBB Add-in for Excel gets a major upgrade](https://openbb.co/blog/openbb-add-in-for-excel-gets-a-major-upgrade/) | Documents `OBB.WIDGET(backend, widget, params)` and shipment on 2025-08-06. | High for behavior | No Excel Add-in source in current public inventory. The earlier [Copilot-in-Excel post](https://openbb.co/blog/bringing-the-openbb-copilot-to-excel/) explicitly describes a hackathon prototype and links a personal backend repo. |
| Audited ODP `develop` is newer than the latest semantic release. | `OpenBB@3e071…:openbb_platform/pyproject.toml:L1-L17`; [v4.7.0 release](https://github.com/OpenBB-finance/OpenBB/releases/tag/v4.7.0) | Pinned tree declares `openbb` 4.7.3; latest semantic release was v4.7.0 on 2026-03-09. Moving desktop aliases `ODP` and `Open-Data-Platform-v1.0.2` were published 2026-04-25. | High | All code counts refer to `develop@3e071…`, not tag v4.7.0. |
| `openbb-ai` is pinned to released code. | [openbb-ai v2.2.0](https://github.com/OpenBB-finance/openbb-ai/releases/tag/v2.2.0) | v2.2.0 was published 2026-08-18. | High | Agent Rita, backends, and docs-MCP have no GitHub Releases; their commit SHA is the stable identity. |

## Quantitative provider and capability audit

### Install-set comparison

| Metric | Default non-optional install | All checked-in extras |
|---|---:|---:|
| Provider entry points | 17 | 32 |
| Provider-model pairs | 266 | 350 |
| Unique provider model IDs | 180 | 202 |
| Core-router entry points | 15 | 19 |
| Statically declared command routes | 210 | 278 |
| Runtime-eligible command routes | 193 | 277 |

The default providers are: `EconDB`, `benzinga`, `bls`, `cftc`, `congress_gov`, `eia`, `federal_reserve`, `fmp`, `fred`, `government_us`, `imf`, `intrinio`, `oecd`, `sec`, `tiingo`, `tradingeconomics`, and `yfinance`.

The full set adds: `ECB`, `alpha_vantage`, `biztoc`, `cboe`, `deribit`, `famafrench`, `finra`, `finviz`, `multpl`, `nasdaq`, `seeking_alpha`, `stockgrid`, `tmx`, `tradier`, and `wsj`.

Evidence: `OpenBB@3e071…:openbb_platform/pyproject.toml:L14-L116` distinguishes mandatory dependencies and extras. Runtime loading is at `openbb_platform/core/openbb_core/app/extension_loader.py:L17-L54,L114-L203`.

### Capability registrations by provider

Each number is the number of keys in that provider's `fetcher_dict`, not a claim about uptime, latency, or commercial entitlement.

| Provider | Models | Provider | Models | Provider | Models |
|---|---:|---|---:|---|---:|
| FMP | 69 | Intrinio | 38 | FRED | 36 |
| yFinance | 29 | SEC | 24 | TMX | 24 |
| Federal Reserve | 13 | CBOE | 11 | Nasdaq | 9 |
| OECD | 9 | EconDB | 8 | Congress.gov | 8 |
| IMF | 8 | Finviz | 7 | Tiingo | 7 |
| Fama-French | 6 | US Government | 6 | Deribit | 5 |
| Tradier | 5 | Benzinga | 4 | Alpha Vantage | 3 |
| ECB | 3 | Seeking Alpha | 3 | WSJ | 3 |
| BLS | 2 | CFTC | 2 | EIA | 2 |
| FINRA | 2 | Biztoc | 1 | Multpl | 1 |
| Stockgrid | 1 | Trading Economics | 1 |  |  |

The exact source names/case are: `fmp 69`, `intrinio 38`, `fred 36`, `yfinance 29`, `sec 24`, `tmx 24`, `federal_reserve 13`, `cboe 11`, `nasdaq 9`, `oecd 9`, `EconDB 8`, `congress_gov 8`, `imf 8`, `finviz 7`, `tiingo 7`, `famafrench 6`, `government_us 6`, `deribit 5`, `tradier 5`, `benzinga 4`, `alpha_vantage 3`, `ECB 3`, `seeking_alpha 3`, `wsj 3`, `bls 2`, `cftc 2`, `eia 2`, `finra 2`, `biztoc 1`, `multpl 1`, `stockgrid 1`, `tradingeconomics 1`.

Fifteen provider objects declare credential fields and seventeen declare none. A missing credential declaration does not guarantee that every upstream operation remains anonymously accessible.

### Exact provider-count histogram

| Providers attached to a model | Number of models | Share of 202 models | Pair contribution |
|---:|---:|---:|---:|
| 1 | **134** | 66.34% | 134 |
| 2 | 32 | 15.84% | 64 |
| 3 | 13 | 6.44% | 39 |
| 4 | 12 | 5.94% | 48 |
| 5 | 5 | 2.48% | 25 |
| 6 | 4 | 1.98% | 24 |
| 7 | 0 | 0.00% | 0 |
| 8 | 2 | 0.99% | 16 |
| **Total** | **202** | **100%** | **350** |

Therefore:

- single-provider models: **134**, or **66.3366336634%**;
- multi-provider models: **68**, or **33.6633663366%**;
- no model has exactly seven providers;
- `EquityHistorical` and `EtfHistorical` have the maximum of eight;
- models with six providers are `CompanyNews`, `EquityQuote`, `EquitySearch`, and `OptionsChains`;
- models with five are `CompanyFilings`, `EquityInfo`, `HistoricalDividends`, `WorldNews`, and `YieldCurve`.

The earlier draft values of 133 single-provider / 69 multi-provider were incorrect. The corrected **134/68** split satisfies both conservation checks:

```text
134 + 32 + 13 + 12 + 5 + 4 + 0 + 2 = 202 models
1×134 + 2×32 + 3×13 + 4×12 + 5×5 + 6×4 + 7×0 + 8×2 = 350 pairs
```

## Quantitative route and identifier audit

### Router composition

There are **19** `openbb_core_extension` entry points: **14** packages under `extensions/` and **5** provider packages (`cftc`, `congress_gov`, `famafrench`, `federal_reserve`, `imf`). The Federal Reserve core router contains only `include_in_schema=False` helper routes, so it adds no audited command/OpenAPI routes.

There are also **32** provider entry points, **1** OBBject extension, and **10** chart-view entry points. The general `ExtensionLoader` knows core/provider/OBBject groups, while chart views are loaded separately by `Charting` via `entry_points(group="openbb_charting_extension")` at `OpenBB@3e071…:openbb_platform/obbject_extensions/charting/openbb_charting/charting.py:L61-L64`.

### Eligible command routes

The all-extras graph declares 278 command routes. `SignatureInspector.complete` drops `/equity/price/nbbo` because no provider advertises `EquityNBBO`, yielding **277 eligible unique paths**.

| Top-level route | GET | POST | Total |
|---|---:|---:|---:|
| `cftc` | 2 | 0 | 2 |
| `commodity` | 6 | 1 | 7 |
| `crypto` | 2 | 0 | 2 |
| `currency` | 4 | 0 | 4 |
| `derivatives` | 7 | 1 | 8 |
| `econometrics` | 0 | 15 | 15 |
| `economy` | 42 | 0 | 42 |
| `equity` | 69 | 0 | 69 |
| `etf` | 12 | 0 | 12 |
| `famafrench` | 7 | 0 | 7 |
| `fixedincome` | 25 | 0 | 25 |
| `imf_utils` | 9 | 0 | 9 |
| `index` | 7 | 0 | 7 |
| `news` | 2 | 0 | 2 |
| `quantitative` | 0 | 19 | 19 |
| `regulators` | 8 | 0 | 8 |
| `technical` | 0 | 27 | 27 |
| `uscongress` | 10 | 2 | 12 |
| **Total** | **212** | **65** | **277** |

Of these, **201** are model-backed and **76** are model-less custom/computation routes. The 201 routes use 201 distinct provider model IDs. Of the 202 provider model IDs, only `Filings` is not attached to a routed decorator. The 201 routes expand to **349** routed provider/model combinations.

The default install declares 210 routes but only 193 are eligible. Its seventeen skipped routes are:

```text
/derivatives/futures/instruments        FuturesInstruments       only deribit
/derivatives/futures/info               FuturesInfo              only deribit
/fixedincome/corporate/bond_prices      BondPrices               only tmx
/equity/compare/groups                  CompareGroups            only finviz
/equity/darkpool/otc                    OTCAggregate              only finra
/equity/discovery/top_retail            TopRetail                only nasdaq
/equity/price/nbbo                      EquityNBBO               no provider in full tree
/equity/shorts/short_volume             ShortVolume              only stockgrid
/equity/shorts/short_interest           EquityShortInterest      only finra
/index/snapshots                        IndexSnapshots           only cboe/tmx
/index/search                           IndexSearch              only cboe
/index/sp500_multiples                  SP500Multiples           only multpl
/index/sectors                          IndexSectors             only tmx
/etf/discovery/gainers                  ETFGainers               only wsj
/etf/discovery/losers                   ETFLosers                only wsj
/etf/discovery/active                   ETFActive                only wsj
/currency/reference_rates               CurrencyReferenceRates   only ECB
```

Evidence: route construction and skip semantics are at `OpenBB@3e071…:openbb_platform/core/openbb_core/app/router.py:L87-L170,L227-L296,L515-L536`.

### Identifier continuity and collisions

All 277 eligible routes have two or three path segments. For each route:

```text
REST path:           /equity/price/historical
route/widget ID:     equity_price_historical
ODP MCP tool name:   equity_price_historical
catalog widget ID:   equity_price_historical_<provider>_obb
chart catalog clone: equity_price_historical_<provider>_obb_chart
```

Results:

- 277 unique paths;
- 0 route path collisions;
- 0 collisions after `/` to `_` normalization;
- 425 base widget definitions before config exclusion/chart clones:
  - 349 provider-specific model-route definitions;
  - 76 model-less/custom definitions;
- 0 collisions among those 425 provider-suffixed IDs.

The widget compiler removes the API prefix, replaces `/` with `_`, emits `{route_id}_{provider}_obb`, and attaches `mcp_tool = {mcp_server: "Open Data Platform", tool_id: route_id}` at `OpenBB@3e071…:openbb_platform/extensions/platform_api/openbb_platform_api/utils/widgets.py:L298-L312,L559-L615`. It may then exclude POST widgets, apply `x-widget_config`, or append `_chart` at `L631-L739`; therefore 425 is a reproducible pre-filter ceiling, not the final runtime catalog count.

ODP MCP applies category/subcategory/tool naming from path segments at `OpenBB@3e071…:openbb_platform/extensions/mcp_server/openbb_mcp_server/app/app.py:L403-L519`. The default module map excludes `econometrics`, `quantitative`, `technical`, and `coverage` at `.../utils/fastapi.py:L42-L53,L249-L333`. On the all-extras command graph the first three remove **61 POST routes**, leaving **216 command candidates**. The actual MCP component count is larger and dynamic because the server adds discovery/admin tools, skill installation, prompts-as-tools, resources-as-tools, and configured skills. With only ordinary ODP dependencies plus the optional MCP package, only the 193 default-install command routes exist.

After the catalog boundary, `openbb-ai` distinguishes:

- catalog `widget_id`;
- widget instance `uuid`;
- `origin`;
- dashboard/tab/widget UUIDs;
- citation UUID.

For extra widgets, a missing UUID is deterministically derived from `origin + widget_id`; citation IDs default to fresh UUIDs. See `openbb-ai@9a2f…:openbb_ai/models.py:L190-L223,L235-L280,L380-L479,L620-L673`. Closed Workspace code determines persistence and remapping rules for actual dashboard instances.

## Runtime architecture

### 1. Import and generated SDK

Importing `openbb` is active composition:

1. `openbb_platform/core/openbb/__init__.py:L8-L36` imports `BaseApp`, `create_app`, `PackageBuilder`, and `ReferenceLoader`, then builds the package.
2. `L39-L40` triggers build/reference generation at import.
3. `L42-L49` imports generated `openbb.package.__extensions__.Extensions` and creates `obb`, falling back to `BaseApp` on missing generated code.
4. `openbb_core/app/static/app_factory.py:L23-L63` produces an `App` that combines `BaseApp` with generated `Extensions`.
5. `openbb_core/app/static/container.py:L11-L58` binds `CommandRunner`/settings to OBBject and normalizes requested output type.

This makes the public Python API a generated view of installed entry points, not a hand-maintained parallel client.

### 2. Extension and plugin loading

`ExtensionLoader` defines exactly three general groups—core, provider, OBBject—at `OpenBB@3e071…:openbb_platform/core/openbb_core/app/extension_loader.py:L17-L31`. It:

- sorts installed entry points (`L141-L145`);
- loads OBBject `Extension` objects (`L151-L161`);
- accepts native `Router`, FastAPI, or APIRouter core objects (`L163-L178`);
- loads provider `Provider` objects and skips `ModuleNotFoundError` (`L180-L196`);
- registers per-route or wildcard output callbacks (`L61-L69`).

`RegistryLoader` lowercases provider names and inserts loaded providers at `openbb_core/provider/registry.py:L13-L27,L34-L55`. `RouterLoader` mounts every core entry point at `/{entry_point_name}` at `openbb_core/app/router.py:L515-L536`.

The cookiecutter confirms the external extension contract:

- core/provider entry points: `openbb-cookiecutter@538c…:{{cookiecutter.project_slug}}/pyproject.toml:L20-L24`;
- `Provider(fetcher_dict=…)`: template provider module `L8-L19`;
- custom or standard Query/Data/Fetcher TET: template model `L1-L121`;
- custom GET/POST plus model route: template router `L12-L48`.

Limitation: the template pins `openbb-core ^1.4.8`, while the audited monorepo uses the 1.6.x core line, so it is useful structural evidence but version-stale.

### 3. Provider model and TET execution

The contract is late-bound by `(provider, model)`:

1. A route declares a standard model, e.g. `EquityHistorical`, in `extensions/equity/openbb_equity/price/price_router.py:L14-L60`.
2. `Query` obtains the generated model name from `StandardParams`, filters provider-only extra fields, and invokes `QueryExecutor`: `openbb_core/app/query.py:L17-L80`.
3. `QueryExecutor` resolves a provider from the registry, resolves its fetcher by model name, filters SecretStr credentials, and calls the fetcher: `provider/query_executor.py:L12-L97`.
4. `Fetcher.fetch_data` performs transform query → sync/async extract → transform data: `provider/abstract/fetcher.py:L36-L100`.
5. A provider registers concrete fetchers through `Provider.fetcher_dict`; the abstract contract and provider-prefixed credential names are at `provider/abstract/provider.py:L6-L54`.

Concrete example:

- standard query/data fields: `provider/standard_models/equity_historical.py:L17-L61`;
- yFinance query/data extensions and widget metadata: `providers/yfinance/openbb_yfinance/models/equity_historical.py:L23-L105`;
- yFinance TET: same file `L108-L193`;
- yFinance capability map: `providers/yfinance/openbb_yfinance/__init__.py:L41-L79`.

### 4. Provider selection

Selection is an ordered credential gate, not a planner. `Container._get_provider` at `openbb_core/app/static/container.py:L60-L114` behaves as follows:

1. an explicit provider choice wins;
2. otherwise use the command-specific configured provider list, or generated default priority;
3. if there is exactly one candidate, use it directly;
4. otherwise choose the first candidate whose declared credentials are present;
5. if none qualifies, report missing credentials or package-not-installed reasons.

It does not score price, contractual entitlement, latency, freshness, uptime, quality, or schema completeness. Credential-free providers have an empty requirement list, for which `all([])` is true.

### 5. Standard model composition

`RegistryMap` separates standard fields from provider extras, captures original types, and validates QueryParams/Data inheritance at `OpenBB@3e071…:openbb_platform/core/openbb_core/provider/registry_map.py:L71-L132,L143-L202`.

`ProviderInterface` then:

- generates provider choices, parameter types, and return unions (`app/provider_interface.py:L70-L119`);
- merges same-named fields/types/descriptions/schema metadata across providers (`L175-L242`);
- creates FastAPI query/body types and Literal choices (`L245-L367`);
- exposes standard fields while forcing provider-only fields optional (`L373-L446`).

The boundary is permissive:

- `QueryParams` uses `extra="allow"`: `provider/abstract/query_params.py:L54-L70`;
- `Data` allows extras and is non-strict: `provider/abstract/data.py:L26-L85`.

Inference: OpenBB's model layer is a practical normalization contract and extension mechanism. It should not be described as a fully governed semantic ontology without an additional layer for identity, relationships, constraints, lineage, policies, and Actions.

## OBBject and provenance

The public OBBject envelope exposes `results`, `provider`, `warnings`, `chart`, and `extra`, while route/standard/extra parameters are private fields: `OpenBB@3e071…:openbb_platform/core/openbb_core/app/model/obbject.py:L36-L70`.

Relevant paths:

- `to_llm` serialization: `obbject.py:L337-L353`;
- `AnnotatedResult` metadata copied under `extra.results_metadata`: `obbject.py:L364-L383`;
- provider-level `AnnotatedResult` is only `{result, metadata}`: `provider/abstract/annotated_result.py:L10-L20`;
- selected provider stamped by CommandRunner: `app/command_runner.py:L239-L258`;
- parameters, warnings, and logs assembled: `L308-L425`;
- optional invocation metadata with route/time/duration/args: `L431-L535`, model fields at `app/model/metadata.py:L11-L22`;
- route/wildcard output extensions and mutation/results-only behavior: `command_runner.py:L538-L639`.

Verified core provenance:

```text
chosen provider
invoked route
optional timestamp/duration
invocation arguments, trimmed for size
warnings/logs
arbitrary provider-supplied result metadata
```

Not required by the core contract:

```text
upstream request/source URL
dataset name and immutable version
record-level source identifier
provider retrieval timestamp per row
license or usage-right identifier
entitlement/policy decision and actor
transformation lineage graph
evidence/content hash
stable citation ID
```

Confidence is high for the negative contract claim because these mandatory fields are absent from OBBject, Metadata, and AnnotatedResult, and the execution path does not synthesize them. A provider may put some information in arbitrary metadata; that is not a platform invariant.

## Generated REST, widgets, and UI parameter linking

### REST surface

`openbb_core/api/rest_api.py:L45-L88` creates FastAPI and mounts command/coverage routers; DEV mode additionally mounts auth/system. `api/router/commands.py:L212-L356` wraps every plugin route, injects user settings, invokes the same `CommandRunner`, applies output extensions, and validates/serializes OBBject.

This is why Python and REST are two generated access surfaces over the same provider/router graph rather than independent business logic stacks.

### OpenAPI to `widgets.json`/`apps.json`

The in-tree platform API extension identifies itself as the launcher/widget builder for a Workspace custom backend at `OpenBB@3e071…:openbb_platform/extensions/platform_api/openbb_platform_api/main.py:L1-L4`. It:

- reads environment/settings paths, custom app JSON, and backend headers (`L38-L69`);
- calls `app.openapi()` and excludes data-processing modules (`L87-L110`);
- serves generated/custom `/widgets.json` (`L133-L168`);
- serves and locally persists `/apps.json` in `workspace_apps.json`, filtering widget IDs (`L171-L249`);
- serves agent definitions (`L252-L285`);
- defaults locally to `127.0.0.1:6900` (`L288-L336`).

`utils/api.py:L96-L210` honors custom router widgets, persists editable generated widgets, and interactively merges changes. `utils/widgets.py:L223-L739`:

1. walks OpenAPI paths, preferring GET when both methods exist;
2. derives route/widget identity;
3. extracts provider choices and query/data schemas;
4. creates one provider-specific definition per route/provider;
5. injects hidden `{paramName: "provider", value: provider, show: false}`;
6. layers route, model, provider, and parameter `x-widget_config` metadata;
7. excludes ordinary POST widgets unless supported widget types are configured;
8. optionally clones a chart widget.

The result is convention-heavy. Names/categories, capitalization, provider display names, field types, columns, and layouts use heuristics plus override metadata. It is a productive compiler, not a semantic guarantee.

### Workspace parameter linking contract

The public docs specify string-based composition:

- same `paramName` and options configuration makes parameters groupable across widgets: `openbb-docs@acd5…:content/workspace/developers/widget-parameters/parameter-grouping.md:L17-L19,L40`;
- table `cellOnClick` with `actionType: "groupBy"` updates the shared parameter and refreshes linked widgets: `cell-click-grouping.md:L134-L146`;
- `forceUpdate` is needed for the source table to refetch itself: `cell-click-grouping.md:L233-L253`;
- `$category`-style `optionsParams` interpolation creates dependent dropdowns: `dependent-dropdown.md:L62-L67`;
- the `params` contract, exact `mcp_server`/`tool_id` matching, refresh interval, and stale time are documented at `json-specs/widgets-json-reference.md:L614-L741`;
- widget-specific `storage.mcpUrl` auto-connects iframe MCP tools: same file `L87-L95`.

The iframe bridge example sends:

```javascript
{ type: "openbb:widget-params:update", params: { ticker: "NVDA" } }
{ type: "openbb:widget-params:update", paramName: "ticker", value: "NVDA" }
```

Evidence: `backends-for-openbb@a629…:widget-examples/iframe-bridge-example/README.md:L1-L44` and `main.py:L187-L228`. The example says Workspace persists the parameter, propagates it to grouped widgets, and triggers refetch. The embedded iframe itself calls `postMessage(..., "*")`; host-side origin/token validation cannot be audited because the Workspace consumer is absent.

## The three MCP boundaries

### A. Open-source ODP MCP

The ODP MCP package imports the ODP FastAPI app (`OpenBB@3e071…:openbb_platform/extensions/mcp_server/openbb_mcp_server/app/app.py:L14-L61`) and runs `FastMCP.from_fastapi` after filtering and mapping routes (`L345-L550`). It supports:

- path-derived tool naming and category tags;
- per-route MCP configuration;
- schema compression and trimmed descriptions;
- fixed toolsets or progressive discovery activation;
- bundled/user skill providers;
- prompts/resources exposed through transforms;
- stdio or HTTP transport;
- optional inbound and outbound Basic credentials;
- optional FastMCP cache expiration.

Default settings and their caveats are at `models/settings.py:L14-L121,L185-L220,L249-L295`. Discovery mode is explicitly described as unsuitable for multi-client/fixed-toolset deployments at `L61-L69`.

ODP MCP auth at `app/auth.py:L15-L105` interprets an incoming Bearer value as base64-encoded `username:password`, compares credentials in constant time, and returns an access token with empty scopes and no expiry. This is local server auth, not the hosted Workspace PAT model.

### B. Hosted Workspace MCP

The official docs describe two directions: external agents operating Workspace and Copilot using external MCP servers. The external-agent path is:

```text
MCP client
  → hosted Workspace /mcp endpoint with obb_mcp_… PAT
  → Workspace WebSocket/browser relay
  → one active signed-in Workspace browser session
  → frontend/backend operations and connected data
```

Evidence:

- overview and two directions: `openbb-docs@acd5…:content/agents/workspace-mcp-overview.md:L19-L34`;
- relay/browser architecture and one active session per user: `L44-L66`;
- capabilities/resources: `L68-L84`;
- identifier-discovery/build/register/test workflow: `L88-L113`;
- PAT scope and disallowed billing/org/invite/sharing actions: `L115-L126`;
- exact-ID and snapshot-first guidance: `content/agents/workspace-mcp-tools.md:L18-L64`;
- dynamic options and live widget data: `L66-L169`;
- widget lifecycle, generated artifacts, backends, apps, and saved/shared dashboards: `L292-L475`;
- documented prompts/resources: `L516-L544`.

The browser must remain open and connected. The docs claim the agent is governed by the user's entitlements and that credentials remain vaulted. Those are product-behavior claims; the enforcement code, PAT storage, relay binding, audit events, and artifact ACL inheritance were not public.

### C. Rita's PoC Workspace bridge

Rita is valuable as a public reference protocol, not as proof of hosted MCP internals.

- Its README describes a thin harness/model-selection boundary and a local widget/SQL + browser bridge architecture: `agent-rita@f673…:README.md:L84-L151`.
- Workspace frontend functions are explicitly outside the repo. External MCP descriptors arrive in each request; the agent registers no-execute wrappers, emits `execute_agent_tool`, and lets the browser dispatch/repost results: `README.md:L245-L263`.
- Typed `$rita_kind` result payloads and hidden `x-agentrita-*` decoration are documented at `L265-L285`.
- Citations and continuation data ride in `extra_state`; one logical turn may require multiple POSTs: `L287-L304`.
- `src/routes/query.ts:L91-L178` validates `/v1/query`, tiers widgets, handles cached reposts, uses `X-Trace-Id` as conversation identity, and invokes the SSE loop.
- `src/agent/loop.ts:L500-L637,L718-L786` restores continuation state, tracks logical turns/tokens, requires transient state on every round trip, batches ordinary widget fetches, and handles SSRM sequentially.
- `src/protocol/extra-state.ts:L13-L100` defines the browser-echoed state, pending bridge queue, tables/docs/trace/usage/timezone.

The MCP bridge stores sessions per browser tab in a module-global in-memory map and generates a random session/token: `mcp-server/src/bridge/state.ts:L1-L12,L89-L204`. `bridge/execute.ts:L1-L9` says the current proof of concept chooses the first connected browser and defers production session decoration. This is not safe evidence for production tenant routing.

Current server code registers **18 Workspace bridge tools**, then two prompts and sixteen resources: `mcp-server/src/server.ts:L220-L305`. Rita's README says 16 operations, so documentation lags code. The pin's code is authoritative for Rita only.

Additional Rita contradictions/risks:

- `src/agent/row-cache.ts` has an actual 30-minute TTL while an adjacent comment says five minutes; actual constant wins.
- the row cache is module-global and has no explicit size cap/LRU; `globalThis` preserves it over hot reload (`row-cache.ts:L1-L51`).
- stale comments say SQL moved out of process while current README/tool factory still includes local SQL; executable code wins.

## OpenBB AI agent protocol and identifiers

`openbb-ai` models a stateless agent backend. The Workspace sends the complete state needed for each `QueryRequest`: chat history/context, widgets, URLs, API keys, workspace state, options, and tools (`openbb_ai/models.py:L763-L813`).

A remote function call is a two-request continuation:

1. agent emits a function-call SSE event and closes;
2. Workspace executes the frontend function;
3. Workspace reposts original messages plus call and result;
4. agent resumes generation.

Evidence: `openbb-ai@9a2f…:README.md:L90-L110,L336-L418` and function-call literals/SSE types at `openbb_ai/models.py:L899-L922`.

Wire-model details:

- `SourceInfo` contains type, UUID, origin, widget ID, name, description, arbitrary metadata, and citable flag (`models.py:L190-L207`);
- equality only considers `metadata.input_args` after core identity (`L209-L223`);
- citations carry a default-random UUID, source info, details, and highlights (`L235-L280`);
- `Widget` enforces parameter/dependent-option consistency and derives an absent UUID from `origin+widget_id` (`L287-L479`);
- widget tiers are primary, secondary, and extra (`L482-L492`);
- function results carry function, inputs, data, and extra state (`L585-L601`);
- datasource payload uses `widget_uuid`, `origin`, catalog ID, and args (`L620-L637`).

This protocol preserves enough identity to continue a conversational operation and cite a widget instance. It does not itself establish source lineage below that widget.

## Authentication and entitlement

### ODP core

The built-in REST authentication model is one global HTTP Basic username/password from environment settings with constant-time checks: `OpenBB@3e071…:openbb_platform/core/openbb_core/api/auth/user.py:L12-L43`. Without that mode, local user settings are used (`L46-L56`).

`AuthService` can load a separately installed core extension exposing router, auth hook, and user-settings hook: `app/service/auth_service.py:L28-L76`. When `API_AUTH` is enabled, every command wrapper gets the authenticated user-settings dependency: `api/router/commands.py:L132-L144`.

Therefore, ODP core provides an extension seam but no native tenant organization, role graph, row/data-source entitlement engine, or audit-policy model.

Credentials are dynamic provider-prefixed SecretStr fields sourced from provider registry, local JSON, and environment, with environment taking precedence: `app/model/credentials.py:L38-L92,L115-L169`. `L172-L219` can serialize/show settings subject to masking choices. The default local file is `~/.openbb_platform/user_settings.json`: `app/service/user_service.py:L14-L49`.

### Workspace products

Enterprise docs claim:

- on-premises/private-cloud data sovereignty;
- RBAC across applications, widgets, data sources, and AI features;
- MFA, detailed audit logs, export controls, retention policies, and SOC 2 support;
- OIDC/Azure, Google OAuth, SAML 2.0, JIT provisioning, custom roles.

Evidence: `openbb-docs@acd5…:content/workspace/getting-started/enterprise/data-control.md:L22-L48` and `administration.md:L21-L41`.

Confidence is medium-high for product documentation and low for enforcement mechanics because the Workspace implementation, database schema, and policy checks were not public.

## Caching and persistence

### ODP

- Cache/data/export directories are user preferences: `OpenBB@3e071…:openbb_platform/core/openbb_core/app/model/preferences.py:L12-L15` and `app/utils.py:L170-L186`.
- The shared `provider/utils/lru.py:L12-L40` helper is process-local TTL hashing plus `functools.lru_cache`.
- `QueryExecutor.execute` always calls the selected fetcher directly (`provider/query_executor.py:L65-L97`); there is no universal core result-cache interface around all queries.
- Caching is provider-specific and heterogeneous. CBOE helpers, SEC, TMX, ECB, and EconDB modules use combinations of SQLite, aiohttp cache, `lru_cache`, or async TTL helpers. SEC Form 4 also maintains a local SQLite database.
- ODP MCP exposes `cache_expiration_seconds`, defaults it to `None`, and forwards only non-null values to FastMCP: `mcp_server/.../models/settings.py:L116-L121,L249-L271`.
- The platform API persists editable widget/app/user configuration JSON, not query results: `platform_api/openbb_platform_api/main.py:L133-L249`; `utils/api.py:L96-L210`.

Inference: cache keys, TTL, invalidation, persistence medium, and provenance/freshness semantics are provider or dependency concerns rather than a single governed platform contract.

### Workspace Lite

Workspace Lite documentation identifies the durable boundary:

| Path | Purpose |
|---|---|
| `/data/openbb.db` | SQLite database |
| `/data/storage` | uploaded files/local folder storage |
| `/data/secrets.env` | generated runtime secrets and admin credentials |

It instructs operators to back up the entire `/data` mount, including WAL/SHM when present, and says local email/password accounts are managed from the admin UI: `openbb-docs@acd5…:content/workspace/getting-started/lite/operations.md:L17-L56`.

The image comes from a private registry. Database schema, migrations, concurrency model, encryption-at-rest details, lineage tables, retention implementation, and ACL persistence are not auditable from current public source.

### SnapTrade reference integration

The public SnapTrade app illustrates a workaround, not a platform invariant:

- it mints a user-scoped HMAC token;
- stores an encrypted session in Redis with a 15-minute TTL;
- rewrites widget endpoints/MCP URLs to include the token because Workspace does not forward configured backend headers to that MCP path.

Evidence: `openbb-snaptrade@5edc…:README.md:L86-L114`, `auth.py:L7-L94`, `user_store.py:L20-L113`, `widgets/__init__.py:L73-L78`, and `mcp_server.py:L85,L113-L160,L200-L236`.

This repository's Redis usage is application-specific. It does not show that ODP or Workspace universally uses Redis.

## License analysis

At the audited pins:

- `OpenBB`/ODP is AGPL-3.0 at the repository root, and its provider/extension packages generally declare `AGPL-3.0-only`.
- All cloned current adjacent repositories with a root license use MIT, except `experimental-openbb-platform-agent`, which has no root license.
- `openbb-docs` received an MIT license in its 2026-08-24 HEAD commit.
- The August 25 announcement promises a future permissive release of the entire suite, including ODP, but the audited ODP source has not yet made that transition.

Consequently, “OpenBB announced permissive open source” and “the current ODP pin is AGPL” are simultaneously true. A design/comparison report should not label the current ODP tree MIT or presume the unreleased Workspace/Copilot/Excel license text.

## Evidence-gap and contradiction ledger

| Topic | Verified evidence | What remains unknown / contradiction | Confidence |
|---|---|---|---|
| Whole-suite open-source status | Official commitment dated 2026-08-25 | Release timing explicitly pending; product source absent on 2026-09-02 | High |
| Workspace UI | Docs, design system, backend examples | Actual frontend/state implementation unavailable | High |
| Hosted Workspace MCP | Behavioral docs and launch blog | Endpoint, relay, PAT, ACL, audit, and session-binding code unavailable | High |
| Built-in Copilot | Product docs/blog | `openbb-ai`/Rita are BYO/reference code, not proof of built-in internals | High |
| Excel Add-in | Shipped formula contract | Add-in implementation unavailable | High |
| Enterprise RBAC/lineage | Product documentation | Enforcement/storage code unavailable | Medium-high |
| OBBject lineage | Core envelope and execution source | Mandatory record/source/license/policy lineage fields absent | High |
| Provider quality | 350 registered capabilities | Availability, rate limits, terms, freshness, and data quality not measured | High on count, none on quality |
| Widget count | 425 base candidates | Final count changes with install set, POST exclusions, charting, config, and persistence | High on pre-filter count |
| MCP count | 216 full-extras command candidates after exclusions | Admin/skills/prompts/resources and settings make final count dynamic | High on command count |
| Rita bridge tools | Current code has 18 | README says 16 | High |
| Rita row-cache TTL | Constant is 30 minutes | Comment says five minutes | High |
| Cookiecutter compatibility | Correct architectural template | Core dependency line is stale relative to audited monorepo | High |
| `workspace-mcp` source | Cached discovery surface advertised it | Live clone and GitHub API return not found | High for current unavailability |

## Corrections that must propagate into the final synthesis

1. **Core entry points:** 19 total = 14 extension packages + **5** provider packages, not six.
2. **Route count:** **278 declared / 277 all-extras runtime-eligible**, not 270/269. The lower count came from failing to resolve relative imports under `openbb_regulators`; eight SEC routes were omitted.
3. **Widget base count:** **425**, not 417. The eight recovered SEC routes each contribute one base definition.
4. **ODP MCP command candidates:** **216** after 61 default module exclusions, not 208.
5. **Default install:** keep separate from all-extras: 17 providers, 266 provider-model pairs, 180 unique models, 15 core entry points, 210 declared routes, and 193 eligible routes.
6. **Provider histogram:** **134 single-provider and 68 multi-provider**, not 133/69. Exact distribution is `1→134, 2→32, 3→13, 4→12, 5→5, 6→4, 7→0, 8→2`.
7. **Source status:** describe August 25 as a commitment to release, not proof that Workspace/Copilot/Excel are already open-source.
8. **MCP terminology:** never equate ODP MCP, hosted Workspace MCP, and Rita's PoC bridge.
9. **Provenance:** do not call `OBBject.provider` full lineage.
10. **License:** current ODP pin is AGPL even though a future permissive relicense/release was announced.

## Recommended visualizations and exact paths

1. **Install-time composition**  
   `pyproject entry point → ExtensionLoader → RegistryLoader/RouterLoader → generated Extensions → obb`  
   Sources: `extension_loader.py`, `provider/registry.py`, `app/router.py`, `app/static/package_builder.py`, `core/openbb/__init__.py`.

2. **One financial-data call**  
   `generated SDK function → Container._get_provider → route Query → QueryExecutor → provider Fetcher TET → AnnotatedResult → CommandRunner → OBBject`.

3. **Contract merge**  
   `standard Query/Data model + N provider subclasses → RegistryMap → provider choices/extra params/return union → FastAPI schema`.

4. **Same runtime, three surfaces**  
   `Router path → Python SDK method + REST route + ODP MCP tool`, annotating dot/slash/underscore transformations.

5. **OpenAPI-to-widget compilation**  
   `OpenAPI path/schema → provider split → schema/x-widget overlays → hidden provider → {route}_{provider}_obb → optional chart clone → widgets.json/apps.json`.

6. **Dashboard parameter linking**  
   `paramName/options identity → user selection, cell groupBy, or iframe bridge → Workspace persisted param → grouped widget refetch`, with the closed UI boundary visibly marked.

7. **Agent continuation loop**  
   `QueryRequest → SSE function call → Workspace executes widget/MCP operation → result repost + extra_state → resumed stream/citation`.

8. **Three MCP boundaries**  
   Side-by-side ODP MCP (FastAPI/FastMCP + local Basic), hosted Workspace MCP (PAT + browser relay + documented governance), and Rita PoC (in-memory + first browser).

9. **Provenance/identifier gap map**  
   `upstream provider → standardized row → OBBject provider/invocation metadata → catalog widget ID → instance UUID → citation UUID`, highlighting which lineage fields are mandatory, optional, regenerated, or absent.

10. **Public/private release timeline**  
    Shipped Workspace/Copilot/Excel/MCP milestones → 2026-08-25 permissive-release commitment → 2026-09-02 42-repository inventory and product-source gap.

## Bottom line for an ontology comparison

OpenBB's strongest reusable idea is a generated, extension-driven capability graph: standard model names connect providers to routers, and routers compile into multiple client surfaces with unusually consistent identifiers. Its weak point as an ontology substrate is that those contracts remain endpoint- and schema-centric. They do not natively encode governed object identity, relationships, Actions, entitlement decisions, or mandatory evidence lineage. Workspace documentation claims several of those higher-order properties, but the code that would prove their invariants was not yet public on the audit date. Treat ODP as strong evidence for plugin/provider/interface mechanics and Workspace docs as a product specification whose implementation still requires a second audit after the announced source release.
