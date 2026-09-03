# Manifesto de integridade

Hashes calculados em 2026-09-02, depois da preservação final dos quatro relatórios. Os caminhos são relativos a `openbb-ontology-deep-dive/`.

```text
f8570baccebc408ae13a5542db6f676d528e09b11aaafb740cf22561ab4f9eb1  subagent-reports/README.md
33f8e40cde9d79c5d5a5d66f09c8ac796d623990dbe8c30cca9c8cd34f1b39cc  subagent-reports/01-openbb-repository-forensics.md
974f190ec144668d36fb9523bf251595399694484776b5d7422af04345ddcb49  subagent-reports/02-financial-semantics-ibm.md
e915eba9f0a3ba76c1ec88d40c2f59a14afa5ceb5118042a649e573b0293be8b  subagent-reports/03-palantir-zoen-gap-audit.md
f2332dcc6517090b1d63ab669cac863d3926004e66fae871fca31de2388c7d26  subagent-reports/04-institutional-standards-crosscheck.md
11b20699c40669cdce88524834f09738e04dd6104bb3055dca5cc6899852fe36  report-source.md
cde60767cafe1bbdef3d1d5dd145dbcf1a7ae101c18b04041c37ed2db8efc0db  openbb-ontology-deep-research.html
```

Para conferir no macOS, execute a partir do diretório `openbb-ontology-deep-dive`:

```sh
shasum -a 256 \
  subagent-reports/README.md \
  subagent-reports/01-openbb-repository-forensics.md \
  subagent-reports/02-financial-semantics-ibm.md \
  subagent-reports/03-palantir-zoen-gap-audit.md \
  subagent-reports/04-institutional-standards-crosscheck.md \
  report-source.md \
  openbb-ontology-deep-research.html
```

Este manifesto não inclui o próprio hash, evitando uma referência circular.
