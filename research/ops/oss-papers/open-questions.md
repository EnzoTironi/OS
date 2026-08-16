# Open questions

**Decision state:** undetermined

1. Is there a public LOM or LOM-action implementation, or only the papers?

2. Does Graphiti’s pair of timestamps match valid time versus knowledge time, or is it one validity window plus ingest time under other names? Read P-ZEP section on the data model before using it as a Q7 answer.

3. Can an OCEL 2.0 log plus a Graphiti graph reconstruct a Ship without inventing a case? Ties DISC-001 to EV-P3.

4. Which AAS submodels (IDTA templates) carry goods-movement meaning versus machine telemetry? BaSyx page does not say.

5. Does TrustGraph OntologyRAG refuse an extract that does not match the OWL, or only bias the prompt?

6. Restate and DBOS were named in #78 and still not fetched. Durable execution for the sandbox replay in P-LOM-ACT might live there. Still not opened.

7. P-LOM-ACT’s “LOM-as-Judge” re-grounds skill output before a session write. Is that a second model, a constraint evaluator, or marketing? The paper describes the intercept. It does not publish the judge.
