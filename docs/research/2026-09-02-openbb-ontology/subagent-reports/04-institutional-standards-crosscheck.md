# Validação cruzada de padrões institucionais para uma ontologia financeira

- **Papel do subagente:** validação independente da síntese institucional, com foco em separar requisitos efetivamente publicados de inferências arquiteturais para Zoen.
- **Data:** 2026-09-02.
- **Escopo:** BCBS 239, GLEIF/LEI, FIBO, ISO 20022, FINOS Common Domain Model e W3C PROV-O.
- **Método:** leitura e comparação exclusivamente de páginas institucionais, especificações normativas e repositórios oficiais. As afirmações foram classificadas pelo que cada padrão realmente cobre em identidade, temporalidade/eventos, proveniência/qualidade e governança. Não foram usadas fontes secundárias para sustentar conclusões.

## Conclusão executiva

A síntese é direcionalmente correta, mas exagera a convergência. Os padrões sustentam semântica explícita, identificadores contextualizados, eventos/timestamps, qualidade e governança; não prescrevem conjuntamente identidade canônica opaca, bitemporalidade, event sourcing append-only, resolução de divergências, entitlement ou Actions à la Palantir.

Em termos rigorosos:

- **Exigência ou contribuição publicada:** vocabulários e contratos semânticos governados; identificadores com escopo; reconciliação, ownership e controles de qualidade; representação explícita de eventos e proveniência; versionamento e processos de mudança.
- **Escolha arquitetural de Zoen:** um EID interno universal, fatos imutáveis com vários relógios, armazenamento append-only, preservação de alegações concorrentes, `ResolutionPolicy`/`ResolutionReceipt`, entitlements por finalidade e projeção uniforme para CLI, API, MCP, stream e conversa.

Essas escolhas de Zoen são compatíveis com os padrões e, em vários casos, são uma boa forma de operacionalizá-los. Ainda assim, não devem ser apresentadas como obrigações impostas ou como um modelo comum formalmente acordado pelos seis organismos.

## Matriz de evidências e limites

| Padrão | Identidade | Tempo / eventos | Proveniência / qualidade | Governança | Invariante útil para Zoen |
|---|---|---|---|---|---|
| [BCBS 239 / SRP36](https://www.bis.org/committees/bcbs/basel-framework/standard/srp/36/inforce/2019-12-15/published/2019-12-15) | Taxonomias integradas, metadados e identificadores únicos ou nomenclatura unificada. | Dados atuais, reconstrução “as of” e controles no ciclo de vida; não define bitemporalidade. | Acurácia, integridade, completude, tempestividade, reconciliação, exceções, ownership e fonte autoritativa. | Conselho, gestão sênior, supervisão e responsabilidades formais. | Todo dado publicado deve ter dono, fonte e controles de qualidade. Vários modelos físicos são permitidos, desde que reconciliados automaticamente. |
| [GLEIF / LEI](https://www.gleif.org/en/organizational-identity/lei-vlei/the-legal-entity-identifier-lei), [CDF 3.1](https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-1-data-lei-cdf-3-1-format) | LEI opaco e único para uma entidade jurídica, separado de nomes e IDs de registros. | Distingue data efetiva e data de registro de eventos jurídicos; mantém histórico e deltas na [Golden Copy](https://www.gleif.org/en/lei-data/gleif-golden-copy). | Originador, fontes de validação e [regras formais de qualidade](https://www.gleif.org/en/lei-data/gleif-data-quality-management/data-quality-checks). | ROC → GLEIF → LOUs, com papéis e processos definidos. | Identidade não deve depender do nome. Preserve `effective_at`, `recorded_at`, origem e validação de cada mudança. |
| [FIBO](https://spec.edmcouncil.org/fibo/index.html) | Ontologia formal de entidades, relações, identificadores e schemes; IDs podem depender de papel, contexto ou jurisdição. | Modela ocorrências/eventos e datas, mas não um relógio de conhecimento do sistema. | Semântica e maturidade do próprio modelo; não fornece lineage ou score de qualidade para cada fato operacional. | Artefatos Release/Provisional/Informative e [processo editorial/versionado](https://spec.edmcouncil.org/fibo/page/development-process). | Modele identificador como objeto ligado a um scheme; publique tipos e relações como contrato semântico versionado. |
| [ISO 20022](https://www.iso20022.org/about-iso-20022), [repositório](https://www.iso20022.org/financial-repository) | Dicionário central de componentes; códigos proprietários podem carregar valor, emissor obrigatório e scheme opcional via [Data Source Scheme](https://www.iso20022.org/catalogue-messages/additional-content-messages/data-source-scheme). | Modela transações, fluxos e datas nas mensagens; não mantém histórico de estado interno. | Validação de conformidade estrutural e controle do repositório; não prova a verdade factual do conteúdo. | TC68/SC9, RMG, RA, TSG e SEGs no [modelo de governança](https://www.iso20022.org/about-iso-20022/governance). | Separe contrato de intercâmbio do sistema de registro. Todo código externo deve declarar namespace/emissor. |
| [FINOS CDM](https://cdm.finos.org/docs/event-model/) | Chaves, referências e IDs com issuer/scheme; o [modelo de reference data](https://cdm.finos.org/docs/reference-data-model/) é deliberadamente limitado ao domínio transacional. | Evento é transição `before → after`; distingue event/effective dates e timestamps de workflow; suporta correção/cancelamento. | Lineage entre workflow steps e constraints de validação embutidas. | Modelo aberto sob [governança FINOS](https://github.com/finos/common-domain-model/blob/master/GOVERNANCE.md). | Represente mudanças de negócio como transições explícitas e reconstruíveis; não confunda isso com obrigação de armazenamento append-only. |
| [W3C PROV-O](https://www.w3.org/TR/prov-o/) / [PROV-DM](https://www.w3.org/TR/prov-dm/) | Identificadores, alternates e specializations, mas sem resolução de identidade canônica. | Geração, uso, invalidação, início/fim e [restrições de ordenação](https://www.w3.org/TR/prov-constraints/); não equivale a valid-time/transaction-time. | Entity–Activity–Agent, derivação, atribuição, revisão, primary source e provenance bundles. | Governança do vocabulário e regras de consistência, não governança operacional do negócio. | Toda transformação relevante deve apontar inputs, atividade, agente e output. Proveniência permite avaliar confiança; não escolhe qual alegação é verdadeira. |

## Leitura detalhada por padrão

### 1. BCBS 239

O [documento institucional do BCBS 239](https://www.bis.org/publications/201301-guidelines-principles-effective-risk-data-aggregation-and-risk-reporting) e sua codificação atual no [Basel Framework, SRP36](https://www.bis.org/committees/bcbs/basel-framework/standard/srp/36/inforce/2019-12-15/published/2019-12-15) tratam de governança e capacidade de agregação e reporte de dados de risco.

Evidências relevantes:

- SRP36 pede taxonomias integradas, metadados e identificadores únicos ou convenções de nomes unificadas.
- Permite mais de um modelo de dados, desde que haja reconciliação automatizada robusta entre modelos.
- Exige ownership, controles ao longo do ciclo de vida, reconciliação com fontes, busca de uma fonte autoritativa por tipo de risco, monitoramento e explicação de exceções.
- Requer que bancos consigam produzir subconjuntos de dados referentes a uma data especificada.

Limite: BCBS 239 não define uma ontologia, um identificador interno opaco universal, um ledger bitemporal, um mecanismo de resolução de identidade ou um formato de proveniência. Ele estabelece resultados de controle e governança, não uma implementação técnica única.

### 2. GLEIF e LEI

A página oficial do [Legal Entity Identifier](https://www.gleif.org/en/organizational-identity/lei-vlei/the-legal-entity-identifier-lei) define o LEI como código único de 20 caracteres associado a uma única entidade jurídica. O código não incorpora significado empresarial; esse significado vem dos dados de referência relacionados.

Evidências relevantes:

- O [LEI-CDF 3.1](https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-1-data-lei-cdf-3-1-format) separa o identificador de nomes legais, outros nomes, identificadores de autoridade registral, origem e fontes de validação.
- Eventos jurídicos podem carregar `LegalEntityEventEffectiveDate` e `LegalEntityEventRecordedDate`, distinguindo efeito no mundo e registro/publicação.
- A [Golden Copy](https://www.gleif.org/en/lei-data/gleif-golden-copy) reúne registros correntes e históricos e publica deltas sem transformar a referência original submetida pelas LOUs.
- O programa de [qualidade de dados](https://www.gleif.org/en/lei-data/gleif-data-quality-management/data-quality-checks) publica regras verificáveis, pre-checks e processo de challenge.
- A [governança da GLEIF](https://www.gleif.org/en/about/governance) distribui responsabilidades entre ROC, GLEIF e organizações emissoras locais.

Limite: LEI resolve identidade de entidades jurídicas dentro do Global LEI System. Não é um identificador universal para pessoas, famílias, ativos, contratos ou qualquer objeto de domínio. O padrão oferece um caso forte e transferível, mas não autoriza generalizar sua cobertura.

### 3. FIBO

O [Financial Industry Business Ontology](https://spec.edmcouncil.org/fibo/index.html) publica conceitos e relações do domínio financeiro em uma ontologia semântica independente de plataforma. Seus [produtos oficiais](https://spec.edmcouncil.org/fibo/page/products) permitem representações e usos diversos sem exigir um banco físico único.

Evidências relevantes:

- Identificadores e schemes são conceitos explícitos, em vez de strings sem contexto.
- A ontologia oficial de [LEI Entities](https://github.com/edmcouncil/fibo/blob/master/BE/LegalEntities/LEIEntities.rdf) relaciona um identificador LEI a uma pessoa jurídica e a um esquema de identificação.
- [Parties](https://github.com/edmcouncil/fibo/blob/master/FND/Parties/Parties.rdf) inclui identificação dependente de papel e contexto; schemes fiscais podem depender de jurisdição.
- [Occurrences](https://github.com/edmcouncil/fibo/blob/master/FND/DatesAndTimes/Occurrences.rdf) modela ocorrências/eventos e sua data ou horário.
- O [processo de desenvolvimento](https://spec.edmcouncil.org/fibo/page/development-process) distingue maturidades Release, Provisional e Informative e submete artefatos a publicação e evolução controladas.

Limite: FIBO é uma ontologia conceitual e um vocabulário governado. Não entrega, por si só, runtime operacional, entity resolution, armazenamento bitemporal, avaliação de qualidade por fato, entitlement ou execução de Actions. Algumas fundações atualmente são reutilizadas de ontologias OMG Commons; nem todo conceito estrutural deve ser atribuído exclusivamente a FIBO.

### 4. ISO 20022

A [ISO 20022](https://www.iso20022.org/about-iso-20022) é uma plataforma comum para desenvolver mensagens financeiras. A modelagem é independente de sintaxe, e schemas ou representações de mensagens são derivados de um dicionário e repositório centrais.

Evidências relevantes:

- O [Financial Repository](https://www.iso20022.org/financial-repository) organiza o Data Dictionary e o Business Process Catalogue sob controle de release.
- O [Business Model](https://www.iso20022.org/iso20022-repository/business-model) estabelece conceitos reutilizáveis, enquanto o [Business Process Catalogue](https://www.iso20022.org/understanding-iso-20022-business-process-catalogue) organiza mensagens por processos e transações.
- O [Data Source Scheme](https://www.iso20022.org/catalogue-messages/additional-content-messages/data-source-scheme) permite um valor proprietário acompanhado de emissor obrigatório e nome de scheme opcional. Isso dá contexto a códigos externos.
- A [governança ISO 20022](https://www.iso20022.org/about-iso-20022/governance) define papéis de Registration Management Group, Registration Authority, Technical Support Group e Standards Evaluation Groups.

Limite: ISO 20022 normaliza semântica e intercâmbio de mensagens, não um sistema de registro empresarial. Conformidade de schema não prova correção factual, identidade real, proveniência completa ou autorização de acesso. Datas presentes em mensagens não constituem automaticamente um banco bitemporal.

### 5. FINOS Common Domain Model

O [modelo de eventos do FINOS CDM](https://cdm.finos.org/docs/event-model/) descreve o ciclo de vida de transações como mudanças de estado padronizadas e executáveis.

Evidências relevantes:

- Um evento pode representar uma transição entre estados `before` e `after`; primitivas funcionais e composáveis permitem reconstruir a evolução da transação.
- O workflow diferencia novas ações, correções e cancelamentos e mantém referência ao passo anterior para auditoria.
- O modelo diferencia datas do evento, datas efetivas e timestamps qualificados do workflow, como submissão e criação.
- Identificadores podem carregar referência, issuer e scheme; a [serialização](https://cdm.finos.org/docs/serialization/) preserva tipos, chaves, referências e versão do modelo.
- O modelo inclui constraints de validação, e sua evolução ocorre sob a [governança FINOS](https://github.com/finos/common-domain-model/blob/master/GOVERNANCE.md).

Limite: o próprio [reference data model](https://cdm.finos.org/docs/reference-data-model/) é limitado ao necessário para o domínio transacional coberto. CDM não é um master universal de identidade, uma ontologia empresarial completa ou uma obrigação de armazenamento append-only. “Evento reconstruível” é semântica do modelo; “event store imutável” é decisão de implementação.

### 6. W3C PROV-O

A [PROV-O](https://www.w3.org/TR/prov-o/) é a ontologia W3C para representar proveniência. A [PROV-DM](https://www.w3.org/TR/prov-dm/) fornece o modelo conceitual e a especificação de [PROV Constraints](https://www.w3.org/TR/prov-constraints/) define relações de consistência e ordenação.

Evidências relevantes:

- O núcleo distingue `Entity`, `Activity` e `Agent`, com relações de uso, geração, derivação, atribuição, associação e delegação.
- Extensões representam revisão, fonte primária, alternância, especialização e influências qualificadas.
- A especificação contém tempos de geração, invalidação, início, fim e uso, além de restrições para uma história causal coerente.
- Bundles permitem representar proveniência sobre conjuntos de proveniência.

Limite: PROV descreve como algo surgiu; não determina que algo é verdadeiro. Também não fornece resolução canônica de identidade, qualidade calculada, separação genérica entre business-valid time e system-knowledge time, controle de acesso ou entitlement.

## Seis correções de overclaim

1. **“Todos convergem para um ID canônico opaco + aliases temporais.”**  
   Forte em GLEIF e compatível com FIBO/CDM; BCBS e ISO 20022 exigem consistência/contexto, mas não essa arquitetura completa.

2. **“Golden source preserva rivais e emite ResolutionReceipt.”**  
   Nenhum dos seis exige esse objeto. BCBS pede fonte autoritativa, reconciliação e explicação de diferenças; PROV permite registrar derivações. O receipt é uma boa decisão de Zoen.

3. **“Os padrões exigem três relógios e consultas ‘known then’.”**  
   GLEIF fornece a evidência mais próxima com effective/recorded date; CDM e PROV oferecem timestamps complementares. Bitemporalidade completa continua sendo uma escolha arquitetural.

4. **“Eventos devem ser append-only.”**  
   CDM prescreve transições reconstruíveis e PROV preserva relações históricas, mas nenhum prescreve persistência física append-only.

5. **“Proveniência, qualidade e entitlement formam uma exigência conjunta.”**  
   Proveniência e qualidade são fortemente sustentadas. Entitlement por fornecedor/dataset/campo/finalidade não é coberto por esses padrões; BCBS trata apenas confidencialidade e acesso apropriado.

6. **“A mesma base deve gerar CLI, MCP, stream, projeção e conversa.”**  
   É uma conclusão de produto razoável, não uma exigência institucional.

## Exigência dos padrões versus decisão de Zoen

O limite deve permanecer explícito na documentação e no design review:

| Tema | O que os padrões sustentam | O que permanece uma decisão Zoen |
|---|---|---|
| Identidade | Unicidade em escopo, schemes, issuer, contexto e nomenclatura controlada. | Um EID opaco universal e um serviço único de entity resolution para todos os domínios. |
| Fatos concorrentes | Reconciliação, fonte autoritativa, origem, derivação e explicação de exceções. | Preservar toda alegação como `FactAssertion` e publicar `ResolutionPolicy`/`ResolutionReceipt`. |
| Temporalidade | Datas efetivas, registradas, de evento, geração, invalidação e workflow em contextos específicos. | Contrato uniforme de três ou mais relógios e consultas “o que sabíamos então?”. |
| Eventos | Transições de estado, correções, cancelamentos e relações causais explícitas. | Persistência append-only e event sourcing como arquitetura física obrigatória. |
| Qualidade | Métricas, validações, ownership, exceções, reconciliação e regras publicadas. | Um score universal de confiança ou decisão automática sobre a verdade de cada fato. |
| Proveniência | Fonte, agente, atividade, derivação, geração, revisão e invalidação. | Usar proveniência como mecanismo de adjudicação; PROV registra evidência, não decide o vencedor. |
| Entitlement | Confidencialidade e acesso apropriado aparecem no BCBS; os demais não modelam licenciamento comercial de forma geral. | Permissão por fornecedor, dataset, campo, usuário, finalidade, geografia e canal. |
| Interfaces | Reuso de modelos e geração de representações são favorecidos por FIBO, ISO 20022, CDM e PROV. | Garantir que CLI, API, MCP, stream e Eve exponham os mesmos verbos e invariantes. |
| Actions | Eventos e processos são modelados em ISO 20022 e CDM. | Uma camada operacional de Actions governadas, autorizadas, reversíveis e auditáveis à la Palantir. |

## Formulação segura

> Os padrões convergem na necessidade de significado explícito, identificadores governados, eventos e timestamps distinguíveis, proveniência, qualidade e evolução controlada do modelo. A identidade canônica interna, o histórico bitemporal, a retenção append-only, a resolução explicável de alegações concorrentes, os entitlements e a projeção uniforme para todas as interfaces são escolhas arquiteturais de Zoen informadas — mas não prescritas — por esses padrões.

## Limitações desta validação

- Os seis artefatos têm escopos institucionais diferentes: BCBS 239 é supervisão de agregação de risco; GLEIF cobre identidade jurídica; FIBO é ontologia financeira; ISO 20022 é mensageria; CDM cobre ciclos de vida transacionais; PROV-O descreve proveniência. A comparação identifica padrões transferíveis, não uma harmonização oficial entre eles.
- Esta análise valida afirmações documentais, não desempenho, completude ou adequação de uma implementação concreta de Zoen.
- Não houve acesso a implementações proprietárias de Bloomberg ou Palantir; nenhuma conclusão sobre seus mecanismos internos deve ser inferida desta validação.
- Referências web e modelos vivos, especialmente FIBO, ISO 20022 e CDM, podem evoluir. Os links abaixo são os oficiais disponíveis e conferidos para esta análise em 2026-09-02.
- “Compatível com” não significa “exigido por”. Quando um conceito aparece em apenas um domínio — por exemplo, effective/recorded date no GLEIF ou transições `before/after` no CDM — sua generalização para toda a ontologia é uma decisão de produto.
- A análise não constitui aconselhamento jurídico, regulatório ou de licenciamento de market data. Entitlements devem ser validados separadamente contra contratos de fornecedores, políticas internas e jurisdições aplicáveis.

## Registro de fontes primárias oficiais

### BCBS 239

- [Principles for effective risk data aggregation and risk reporting](https://www.bis.org/publications/201301-guidelines-principles-effective-risk-data-aggregation-and-risk-reporting)
- [Basel Framework — SRP36](https://www.bis.org/committees/bcbs/basel-framework/standard/srp/36/inforce/2019-12-15/published/2019-12-15)

### GLEIF / LEI

- [The Legal Entity Identifier](https://www.gleif.org/en/organizational-identity/lei-vlei/the-legal-entity-identifier-lei)
- [LEI-CDF 3.1](https://www.gleif.org/en/lei-data/access-and-use-lei-data/level-1-data-lei-cdf-3-1-format)
- [GLEIF Golden Copy and Delta Files](https://www.gleif.org/en/lei-data/gleif-golden-copy)
- [GLEIF Data Quality Checks](https://www.gleif.org/en/lei-data/gleif-data-quality-management/data-quality-checks)
- [GLEIF Governance](https://www.gleif.org/en/about/governance)

### FIBO

- [FIBO specification portal](https://spec.edmcouncil.org/fibo/index.html)
- [FIBO Products](https://spec.edmcouncil.org/fibo/page/products)
- [FIBO Development Process](https://spec.edmcouncil.org/fibo/page/development-process)
- [Official FIBO repository — LEI Entities](https://github.com/edmcouncil/fibo/blob/master/BE/LegalEntities/LEIEntities.rdf)
- [Official FIBO repository — Parties](https://github.com/edmcouncil/fibo/blob/master/FND/Parties/Parties.rdf)
- [Official FIBO repository — Occurrences](https://github.com/edmcouncil/fibo/blob/master/FND/DatesAndTimes/Occurrences.rdf)

### ISO 20022

- [About ISO 20022](https://www.iso20022.org/about-iso-20022)
- [Financial Repository](https://www.iso20022.org/financial-repository)
- [Business Model](https://www.iso20022.org/iso20022-repository/business-model)
- [Business Process Catalogue](https://www.iso20022.org/understanding-iso-20022-business-process-catalogue)
- [Data Source Scheme](https://www.iso20022.org/catalogue-messages/additional-content-messages/data-source-scheme)
- [ISO 20022 Governance](https://www.iso20022.org/about-iso-20022/governance)

### FINOS Common Domain Model

- [CDM Event Model](https://cdm.finos.org/docs/event-model/)
- [CDM Reference Data Model](https://cdm.finos.org/docs/reference-data-model/)
- [CDM Serialization](https://cdm.finos.org/docs/serialization/)
- [CDM Governance](https://github.com/finos/common-domain-model/blob/master/GOVERNANCE.md)

### W3C PROV

- [PROV-O: The PROV Ontology](https://www.w3.org/TR/prov-o/)
- [PROV-DM: The PROV Data Model](https://www.w3.org/TR/prov-dm/)
- [Constraints of the PROV Data Model](https://www.w3.org/TR/prov-constraints/)
