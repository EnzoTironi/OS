# Arquivo dos relatórios dos subagentes

Este diretório preserva, em Markdown autocontido, as quatro trilhas de pesquisa que sustentam o dossiê **OpenBB × Bloomberg × Palantir × Zoen**.

**Data da pesquisa:** 2026-09-02  
**Snapshot OpenBB auditado:** `3e071fcc2cd9f891cac6040ae60296dba76dab46`  
**Snapshot Zoen auditado:** `e34445c511f24e879c3dfb93387861f7cdd9e98e`

## Relatórios preservados

1. [OpenBB repository forensics](./01-openbb-repository-forensics.md) — clones, pins, licenças, runtime, providers, standard models, rotas, superfícies geradas, MCPs e fronteira público/privado.
2. [Semântica financeira e estudo IBM](./02-financial-semantics-ibm.md) — identidade de issuer/instrument/listing, FIGI/OpenFIGI, SEC/XBRL, Bloomberg/BLPAPI, FIBO, quatro relógios e contratos `resolve`/`observe`.
3. [Gap audit Palantir ↔ Zoen](./03-palantir-zoen-gap-audit.md) — leitura do kernel atual de Zoen, comparação com uma ontologia operacional, P0s, superfícies, autorização, projeção e limites de escala.
4. [Validação cruzada de padrões institucionais](./04-institutional-standards-crosscheck.md) — BCBS 239, GLEIF/LEI, FIBO, ISO 20022, FINOS CDM e W3C PROV-O, incluindo correções de overclaim.

## Artefatos de síntese

- [Dossiê visual interativo](../openbb-ontology-deep-research.html)
- [Fonte canônica do dossiê](../report-source.md)

## Como ler

- Para entender **como OpenBB funciona de fato**, comece pelo relatório 01.
- Para entender **por que um ticker não é uma identidade e um valor não é um fato sem contexto**, leia o relatório 02.
- Para transformar a pesquisa em **decisões concretas de arquitetura de Zoen**, leia o relatório 03.
- Para distinguir **o que padrões realmente exigem** do que é uma escolha arquitetural informada, leia o relatório 04.
- O dossiê visual combina as quatro trilhas em uma tese e uma sequência de entrega.

## Integridade e reprodutibilidade

Cada relatório registra seu escopo, método, fontes, limitações e, quando aplicável, commits fixados. `SHA256SUMS.md` contém os hashes dos arquivos depois da preservação final. As referências a `/private/tmp` documentam a execução original e podem desaparecer após limpeza do sistema; as conclusões, métricas, pins e evidências essenciais foram incorporados aos próprios relatórios para que eles permaneçam úteis sem esses diretórios temporários.

Os relatórios são evidência de pesquisa, não alterações no produto. Nenhum arquivo do repositório Zoen foi modificado por esta preservação.
