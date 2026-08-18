# Company 2030 Casebook v0

**Versão.** `v0`

**Status.** Não normativo.

**Modo Diátaxis.** `reference`

**Estado epistêmico do artefato.** `hypothesis`. Nunca `accepted`.

## Questão

Quais distinções uma jornada de conjunto de acionamento de bomba, com cadeia chinesa e pessoa jurídica brasileira, força a permanecer separadas para que o scorecard #80 e a suíte #71 possam falsificar o modelo sem colapsar identidade, Action, ocorrência e obrigação legal?

Este documento descreve uma jornada industrial e comercial para consulta e falsificação. Ele registra um caso estruturado que o scorecard #80 e a suíte #71 podem consumir. Não é RFC, tese, tutorial, plano de implementação, scorecard ou suíte executável.

## Classes de claim

Rótulos deste Casebook e a classe do checklist de revisão.

- `premissa do caso`. Enredo do caso. Não é evidência de corpus.
- `inferência`. Classe `inference` do contrato de swarm.
- observação com locator. Evidência de domínio, lei primária, documento oficial ou artefato de fonte já registrado.
- lei candidata citada. Claim no artefato de origem, com o estado que aquele arquivo declara. Este Casebook não relabela `supported` como arquitetura aceita.
- counterexample ou falsifier. Observação que derrotaria a claim da cena.

## Objetivo operacional

Uma pessoa jurídica brasileira atende um pedido do cliente com um conjunto de acionamento de bomba industrial. A cadeia chinesa fornece componentes. A entidade brasileira monta, vende, entrega, escritura e cumpre as obrigações fiscais. A jornada não apaga incerteza, autoria ou responsabilidade.

## O que este caso distingue

As distinções abaixo são condições do caso. Não são uma decisão sobre o metamodelo final. RFC-0002 permanece hipótese proposta.

- Observação. Evidência capturada de uma fonte, com proveniência.
- Inferência. Interpretação do pesquisador ou do operador a partir de premissas citadas.
- Decisão. Escolha governada que autoriza ou recusa um passo.
- Action. Intervenção tentada ou autorizada. Não prova ocorrência.
- Ocorrência. Fato alegado sobre o que aconteceu no mundo modelado.
- Efeito físico. Mudança material produzida por máquina, pessoa ou processo, distinta da Action que a pediu e da evidência do sensor que a relata.

Agentes lideram a operação. Pessoas e organizações permanecem legalmente responsáveis até evidência em contrário. O robô, o agente e o workload não recebem responsabilidade legal por conveniência narrativa.

## Elenco

**Premissa do caso.** Os nomes abaixo são identidades do caso. Não são registros de uma empresa real.

### Organizações legalmente responsáveis e pessoas do caso

- Organização Alfa. Pessoa jurídica brasileira. Livros, registro estatutário e obrigação fiscal principal se ligam a esta pessoa jurídica. [`research/domain/party/candidate-laws.md`](../research/domain/party/candidate-laws.md) L2. [`research/domain/multi-entity/candidate-laws.md`](../research/domain/multi-entity/candidate-laws.md) L1.
- Representante legal de Alfa. Premissa do caso. Pessoa nomeada no elenco para assinar atos da pessoa jurídica. Este Casebook não cita lei primária que prove responsabilidade pessoal deste cargo em cada ato.
- Responsável fiscal de Alfa. Premissa do caso. Pessoa nomeada no elenco para classificar e assinar a base fiscal usada nas Actions fiscais. Este Casebook não cita lei primária que prove responsabilidade pessoal deste cargo em cada ato.
- Gerente de compras de Alfa. Premissa do caso. Pessoa nomeada no elenco para aprovar a proposta de compra da cena 2. Este Casebook não cita lei primária que prove responsabilidade pessoal deste cargo em cada ato.
- Cliente Beta. Organização que pede o conjunto acabado. Cliente é papel numa relação comercial, não um Kind. [`research/domain/party/candidate-laws.md`](../research/domain/party/candidate-laws.md) L1. Cenário S-005.
- Fornecedor Gama. Organização chinesa que fornece o motor e o conjunto de acionamento. Fornecedor é papel numa relação de suprimento, não a identidade da organização. [`research/domain/p2p/candidate-laws.md`](../research/domain/p2p/candidate-laws.md) L11.

### Agentes comprometidos e workloads

- Agente de atendimento. Aceita de forma durável o objetivo de atender o pedido `PED-1001` sob a delegação limitada `G-ATEND-01`. O compromisso do agente é com o trabalho delegado. O cursor da orquestração não é verdade de negócio. [`research/runtime/orchestration/orchestration-contract.md`](../research/runtime/orchestration/orchestration-contract.md) seções 1 e 2. Issue #43.
- Agente de planejamento. Propõe plano e compra.
- Agente de contenção. Disputa reserva de lote ou limite de autoridade na cena 3.
- Agente de cadeia. Executa o pedido externo na fronteira chinesa.
- Agente de planta. Dispara a célula robótica e registra evidência.
- Delegação `G-PLANTA-01`. Premissa do caso. No uso por `RecordLateStockEvidence`, só registrar evidência. Sem poder de apagar reservas históricas. Este recorte de uso não altera os escopos já declarados por `RecordInboundCustody` e `StartJob`. O ator de negócio, o representado, a delegação e o workload executor permanecem dimensões distintas.
- Agente fiscal. Prepara o pedido de autorização do documento fiscal eletrônico.
- Agente contábil. Premissa do caso. Ator de negócio do posting da entrega aceita.
- Delegação `G-CONTAB-01`. Premissa do caso. Limitada ao posting contábil da entrega aceita. Sem alargamento para classificação fiscal ou para reescrita de Actions históricas. O workload executor permanece distinto deste ator.
- Agente de governança. Premissa do caso. Ator de negócio da publicação da revisão 2.
- Delegação `G-GOV-01`. Premissa do caso. Limitada à publicação da revisão 2 para atos novos. Revisão humana exigida. Sem poder de reescrever Actions históricas. O workload executor permanece distinto deste ator.
- Workload W-ERP. Processo autenticado que apresenta o agente de atendimento.
- Workload W-MES. Processo autenticado da célula.
- Workload W-GAMA. Conector do sistema operacional de Gama.
- Workload W-DFe. Conector do autorizador do modelo NF-e em uso.

O contrato candidato de autorização mantém ator, representado, workload e grant como dimensões distintas. Uma identidade `principal_id` não apaga essas dimensões. [`research/runtime/authorization/authorization-contract.md`](../research/runtime/authorization/authorization-contract.md) seções 1 e 2. Issue #42.

### Robô

- Célula R-01. Robô de montagem na planta de Alfa. Produz efeito físico rastreável. Não é parte legalmente responsável.

## Product anchor e identidades contextuais

O âncora de produto é um conjunto de acionamento de bomba industrial. As identidades abaixo não são um objeto único. [`research/domain/product/README.md`](../research/domain/product/README.md). [`research/domain/product/candidate-laws.md`](../research/domain/product/candidate-laws.md) L-01, L-02, L-04, R-01.

| Identidade contextual | Valor no caso | Papel |
| --- | --- | --- |
| Especificação | `SPEC-ACIO-BOMBA` | Descrição do tipo de recurso. Pode ser prometida sem instância em estoque. ValueFlows `ResourceSpecification`. [`research/domain/product/evidence.md`](../research/domain/product/evidence.md) E-01. |
| Código do fornecedor chinês | `GAMA-PA-220` | Identificador local de Gama. Não é o SKU vendável de Alfa. |
| Identificador interno de planejamento | `PLN-BOMBA-ACIO` | Chave de explosão e MRP em Alfa. Não é ocorrência de estoque. |
| SKU vendável brasileiro | `SKU-BR-ACIO-01` | Folha que Alfa precifica, promete e fatura. Um template não entra em transação. ERPNext Item Variants. [`research/domain/product/evidence.md`](../research/domain/product/evidence.md) E-05. |
| Lote ou serial observado | `LOT-IN-8841`, `SN-R01-0007` | Grãos distintos. Lote carrega quantidade. Serial identifica uma unidade. [`research/domain/product/candidate-laws.md`](../research/domain/product/candidate-laws.md) L-04. |
| Classificação fiscal alegada por Gama | NCM `8413.91.90` | Premissa do caso. Alegação do fornecedor, não classificação aceita. |
| Classificação fiscal alegada pelo fiscal de Alfa | NCM `8501.20.00` | Premissa do caso. Alegação interna rival. Autoridade de incidência de IPI é a TIPI. [S-TIPI](../research/domain/fiscal/sources.md). [S-ADE1-2026](../research/domain/fiscal/sources.md). |

**Inferência.** Os dois códigos NCM acima são premissas do caso para produzir conflito de classificação. Este Casebook não afirma qual código é o correto para um acionamento de bomba.

Um produto operacional pode participar de várias identidades de fonte. A auditoria HF registrou listing, código interno e SKU como cortes distintos. [`research/ops/reality-check/hf-wave-a.md`](../research/ops/reality-check/hf-wave-a.md) E-RC-002, E-RC-003.

## Pressões reutilizadas

O Casebook liga pressões já catalogadas. Não copia o texto de [`scenarios/README.md`](../scenarios/README.md). A coluna Relação com a jornada classifica cada pressão. Lei ou tema na última coluna não prova instanciação.

| Pressão | ID em `scenarios/README.md` | Relação com a jornada | Caso ou lei local |
| --- | --- | --- | --- |
| Pedido, promessa, plano e fato | S-001 | cobertura parcial | Pedido, promessa e plano aparecem. A data da ocorrência está ausente. Este Casebook não reivindica instanciação completa. [`research/domain/o2c/candidate-laws.md`](../research/domain/o2c/candidate-laws.md) L-003 |
| Cumprimento parcial e resto aberto | S-002 | instanciada | `research/domain/o2c/candidate-laws.md`, L-005 |
| Aprovação stale | S-003 | instanciada | [`research/runtime/transactions/commit-contract.md`](../research/runtime/transactions/commit-contract.md) seções 5 e 8.2 |
| Timeout externo com resultado `unknown` | S-004 | instanciada | [`research/runtime/effects/effect-contract.md`](../research/runtime/effects/effect-contract.md) seções 4.2 e 5.4. `research/domain/fiscal/candidate-laws.md`, CL-005 |
| Papéis cliente e fornecedor | S-005 | referência relacionada | Cliente e fornecedor são organizações distintas no caso. Nenhuma organização ocupa os dois papéis. `research/domain/party/candidate-laws.md`, L1. `research/domain/p2p/candidate-laws.md`, L11 |
| Relação com ciclo de vida | S-006 | referência relacionada | Lei de ciclo de vida de relação permanece catalogada. A jornada não instancia as precondições do cenário. `research/domain/party/candidate-laws.md`, L4 |
| Correção tardia e known-then | S-007 | instanciada | `research/domain/inventory/candidate-laws.md`, L-INV-08, L-INV-16 |
| Rastreio de transformação | S-008 | referência relacionada | Tema de transformação permanece catalogado. A jornada não instancia as precondições do cenário. `research/domain/manufacturing/candidate-laws.md`, L12 |
| Retrabalho e sucata | S-009 | referência relacionada | Tema de retrabalho e sucata permanece catalogado. A jornada não instancia as precondições do cenário. `research/domain/manufacturing/candidate-laws.md`, L8, L10 |
| Cancelamento após consequência irreversível | S-010 | referência relacionada | Tema de cancelamento após efeito irreversível permanece catalogado. A jornada não instancia as precondições do cenário. `research/domain/o2c/candidate-laws.md`, L-008. `research/domain/accounting/candidate-laws.md`, L3. `research/domain/fiscal/candidate-laws.md`, CL-006 e CL-007 |
| Observações contraditórias | S-011 | instanciada | ingest #45, HF E-RC-003 |
| Revisão de ontologia ou política após Action histórica | S-012 | instanciada | RFC-0002 seção de revisão semântica. `docs/open-questions.md` Q19 |

A história V-001 do kill de plataforma existente aponta S-001, S-002, S-003, S-004, S-007 e S-011. [`research/kill/existing-platform/vertical.md`](../research/kill/existing-platform/vertical.md). Neste Casebook, S-001 tem cobertura parcial. S-002, S-003, S-004, S-007 e S-011 estão instanciados. Este Casebook especializa esse recorte no âncora de bomba e na fronteira jurídico-fiscal brasileira. Não substitui V-001.

## Cadeia chinesa, o que as fontes de primeira parte já registram

Vendors chineses de 2026 descrevem quatro camadas. Agente, skills, ontologia ou grafo da firma, e sistema de registro. O modelo pode planejar. O commit ainda passa por capacidade nomeada, permissão herdada e linha de auditoria. [`research/ops/china-enterprise-ai/evidence.md`](../research/ops/china-enterprise-ai/evidence.md).

- Yonyou descreve Ontology-Driven Agent como vocabulário compartilhado da firma, distinto de chute de LLM e de RAG. [yonyou.com/news/4813](https://www.yonyou.com/news/4813), fetch em `research/ops/china-enterprise-ai/sources.md`.
- YonClaw declara autorização dual e trilha de auditoria. Quem iniciou, qual identidade, quais dados, quais ferramentas, quais ações, se houve interceptação, quem confirmou. [yonyou.com/news/4948](https://www.yonyou.com/news/4948).
- Kingdee apresenta Lingee como AI OS sobre o ERP existente, não como substituição do registro. [kingdee.com, 2026-06-23](https://www.kingdee.com/resources/articles/1519374747954812097).
- O documento conjunto MIIT 2025-279 pede agentes industriais e adapters para sistemas industriais. Também pede que o fabricante mantenha MES, DCS e SCADA. [nda.gov.cn](https://www.nda.gov.cn/sjj/zwgk/zcfb/0112/20260107214358696030895_pc.html).
- O documento do Conselho de Estado 2025-11 fixa penetração de terminais e agentes acima de 70% em 2027 e acima de 90% em 2030. [mee.gov.cn](https://www.mee.gov.cn/zcwj/gwywj/202508/t20250827_1126207.shtml).

**Inferência.** O caso trata o sistema operacional de Gama como um sistema de registro externo com capacidade nomeada de pedido. Não afirma que Gama corre YonBIP, Kingdee ou SAP.

## Cena 1. Pedido, Product anchor e identidades contextuais

### Preconditions

Alfa já publicou oferta do SKU `SKU-BR-ACIO-01` conforme `SPEC-ACIO-BOMBA`. A oferta ainda não é compromisso. [`research/domain/o2c/candidate-laws.md`](../research/domain/o2c/candidate-laws.md) L-001. Beta envia o pedido `PED-1001`. Premissa do caso. Quantidade pedida, 10 conjuntos. Data pedida pelo cliente, 18 de agosto. S-001.

### Observations

1. Pedido de Beta. Código `GAMA-PA-220`, quantidade 10, entrega pedida em 18 de agosto. Fonte, portal do cliente. Kind, observação.
2. Catálogo interno de Alfa. O mesmo âncora aparece como `SKU-BR-ACIO-01` e `PLN-BOMBA-ACIO`. Fonte, cadastro de Alfa. Kind, observação.
3. Planilha de planejamento. Quantidade 12 e data planejada 21 de agosto. Fonte, workbook de MRP. Kind, observação. HF já mostrou agregados e códigos compostos sem identidade estável de linha. [`research/ops/reality-check/hf-wave-a.md`](../research/ops/reality-check/hf-wave-a.md) E-RC-001, E-RC-003.
4. Mensagem de vendas. Promessa verbal de 20 de agosto para 10 unidades do "motor Gama". Fonte, chat. Kind, observação. S-011.
5. Ficha de Gama. Classificação NCM `8413.91.90`. Fonte, documento do fornecedor. Kind, observação. Premissa do caso para o código.
6. Minuta fiscal interna. Classificação NCM `8501.20.00`. Fonte, responsável fiscal. Premissa do caso para a autoria pessoal desta minuta. Kind, observação. Premissa do caso para o código.

As quatro datas de S-001 permanecem fatos distintos. Pedido 18, promessa 20, plano 21, ocorrência ainda ausente. [`research/domain/o2c/candidate-laws.md`](../research/domain/o2c/candidate-laws.md) L-003. `docs/open-questions.md` Q3.

### Decisions

O agente de atendimento aceita o objetivo `atender PED-1001` e a delegação `G-ATEND-01`. A delegação cobre proposta e reserva até o limite do pedido. Não cobre classificação fiscal final nem commit de compra. Issue #42.

Alfa não funde as seis observações num único item. A identidade operacional aceita para promessa comercial é `SKU-BR-ACIO-01` conforme `SPEC-ACIO-BOMBA`. Os demais identificadores permanecem claims. [`research/domain/product/candidate-laws.md`](../research/domain/product/candidate-laws.md) L-02. Issue #15. Issue #45.

A classificação NCM permanece divergente. Nenhuma das duas alegações vence nesta cena. [`research/domain/fiscal/candidate-laws.md`](../research/domain/fiscal/candidate-laws.md) CL-009, CL-010.

### Actions

**Action `AcceptCustomerCommitment`.**

- Objetivo. Registrar o compromisso comercial de Alfa com Beta sobre `SKU-BR-ACIO-01`, quantidade 10, promessa de 20 de agosto.
- Parâmetros. `order=PED-1001`, `sku=SKU-BR-ACIO-01`, `spec=SPEC-ACIO-BOMBA`, `qty=10`, `promised_date=2026-08-20`.
- Ator de negócio. Agente de atendimento.
- Representado. Organização Alfa.
- Delegação. `G-ATEND-01`, emitida pelo representante legal, limitada a este pedido. Premissa do caso para a emissão pessoal da grant.
- Base de estado. Oferta vigente e crédito de Beta ainda dentro da política. Compromisso não move estoque. `research/domain/o2c/candidate-laws.md`, L-002.
- Revisão semântica relevante. Revisão da definição de compromisso comercial usada no aceite. RFC-0002 trata Action como hipótese, não como primitiva aceita.
- Autorização ou aprovação exigida. Grant `G-ATEND-01`. Aprovação humana extra, não aplicável nesta Action.
- Efeito externo previsto. não aplicável.
- Responsabilidade legal. Organização Alfa. O agente e o workload W-ERP não assumem a obrigação. A menção ao representante legal no elenco é premissa do caso, não prova de responsabilidade pessoal deste compromisso.

### Expected results

O compromisso existe como leftover demand de 10 unidades. Estoque, receita e documento fiscal ainda não ocorreram. `research/domain/o2c/candidate-laws.md`, L-002, L-005. As observações rivais permanecem consultáveis com proveniência. Issue #45.

### Invariants

- Especificação, código de Gama, id de planejamento, SKU brasileiro, lote ou serial e classificação fiscal alegada não colapsam numa chave.
- Pedido, promessa, plano e ocorrência permanecem fatos distintos. S-001.
- Claims contraditórios sobre o mesmo recorte semântico não forçam um vencedor imediato. `docs/open-questions.md` Q3. `docs/constitution.md`, artigo 9.

### Falsifier

Uma observação de que o caso só se representa se `GAMA-PA-220`, `SKU-BR-ACIO-01`, `PLN-BOMBA-ACIO` e um NCM forem o mesmo objeto, ou se a planilha sobrescrever o pedido de Beta, derrota a claim desta cena.

### Owner issues/RFCs

#14, #15, #16, #45, #70. RFC-0002 como hipótese de Action. #80 e #71 consomem o caso e não são editados aqui.

## Cena 2. Planejamento e compra

### Preconditions

O compromisso `PED-1001` está aberto. Quatro unidades estão disponíveis em Alfa. Quatro exigem autorização de produção. Duas exigem compra de Gama. S-002. Premissa do caso para o recorte 4, 4 e 2.

Às 10:01 o agente de planejamento lê ATP 20 e demanda residual 6, mais uma onda de 980 numa planilha. Propõe `CommitPurchase` de 1000 unidades do código `GAMA-PA-220`. A composição segue V-001. [`research/kill/existing-platform/vertical.md`](../research/kill/existing-platform/vertical.md). S-003.

### Observations

1. Preview da proposta `PROP-COMPRA-77` às 10:01. ATP 20, demanda 980 na planilha, compra proposta 1000. Kind, inferência operacional do agente, com base de estado declarada.
2. O WMS de Alfa posta o recebimento `RCV-LOT-IN-8841-01` de 800 unidades do lote `LOT-IN-8841`, com `occurred_at=2026-08-10T10:06:00-03:00`. Premissa do caso para o identificador e o tempo. Kind, observação. S-003.
3. O ERP de Alfa ainda mostra 20 em mão no instante da aprovação. Kind, observação rival. S-011.
4. Às 10:07 o gerente de compras aprova `PROP-COMPRA-77` como foi proposta às 10:01. Kind, decisão humana registrada. Premissa do caso para a autoria pessoal desta aprovação.

Necessidade não é compromisso. A necessidade de material existia antes da proposta. [`research/domain/p2p/candidate-laws.md`](../research/domain/p2p/candidate-laws.md) L1.

### Decisions

A aprovação humana amarra a proposta `PROP-COMPRA-77`, os parâmetros 1000 e `GAMA-PA-220`, a base de estado das 10:01 e a revisão de política então vigente. Aprovação não é `approved=true` num objeto mutável. [`research/runtime/transactions/commit-contract.md`](../research/runtime/transactions/commit-contract.md) seção 5.

O commit posterior deve reler a base. A aprovação das 10:07 está stale em relação ao recebimento `RCV-LOT-IN-8841-01`. S-003. `research/runtime/transactions/commit-contract.md`, seção 8.2, `NeedsReproposal`.

### Actions

**Action `ProposePurchase`.**

- Objetivo. Publicar proposta de compromisso de compra com Gama para cobrir o residual e a onda da planilha.
- Parâmetros. `proposal=PROP-COMPRA-77`, `supplier_code=GAMA-PA-220`, `qty=1000`, `state_basis=ATP20@10:01`.
- Ator de negócio. Agente de planejamento.
- Representado. Organização Alfa.
- Delegação. `G-PLAN-01`, propor até o teto da política de compras. Commit não está nesta grant.
- Base de estado. Snapshot das 10:01. ATP 20 e demanda 980 da planilha.
- Revisão semântica relevante. Revisão da Action de compra e da política de teto usadas no preview.
- Autorização ou aprovação exigida. A proposta exige aprovação do gerente de compras. Premissa do caso para este aprovador pessoal.
- Efeito externo previsto. não aplicável. Preview não envia pedido a Gama.
- Responsabilidade legal. Organização Alfa.

**Action `ApprovePurchaseProposal`.**

- Objetivo. Registrar aprovação humana da proposta `PROP-COMPRA-77` no escopo das 10:01.
- Parâmetros. `proposal=PROP-COMPRA-77`, `approved_qty=1000`, `approved_at=10:07`.
- Ator de negócio. Gerente de compras. Premissa do caso.
- Representado. Organização Alfa.
- Delegação. Autoridade própria do cargo, não uma grant de agente. Premissa do caso.
- Base de estado. A base que a proposta declara, não o estoque corrente das 10:07.
- Revisão semântica relevante. Revisão de política de aprovação vigente às 10:07.
- Autorização ou aprovação exigida. não aplicável além da própria aprovação.
- Efeito externo previsto. não aplicável.
- Responsabilidade legal. Organização Alfa. A autoria da aprovação pelo gerente de compras é premissa do caso. Este Casebook não cita lei primária que prove responsabilidade pessoal deste cargo neste ato.

### Expected results

Existe proposta aprovada e evidência de que a base mudou no recebimento `RCV-LOT-IN-8841-01`. Não existe ainda compromisso de compra. Oferta de Gama, se houver, permanece distinta de compromisso. `research/domain/p2p/candidate-laws.md`, L2. O agente de planejamento continua comprometido com `PED-1001`. Não trata o token de orquestração como estoque ou pedido.

### Invariants

- Preview não reserva quantidade exclusiva e não posta payable. `research/domain/p2p/candidate-laws.md`, L1, L4.
- Aprovação cita proposta, parâmetros, base e revisão. `research/runtime/transactions/commit-contract.md`, seção 5.
- Recebimento `RCV-LOT-IN-8841-01` e tela ERP das 10:07 convivem como observações. Nenhuma apaga a outra.

### Falsifier

Uma observação de que o commit aceitou `PROP-COMPRA-77` sem releitura, ou de que a aprovação das 10:07 se deslocou em silêncio para a quantidade 200, derrota a claim. Escape hatch narrativo que trata stale como detalhe de UI também derrota a claim.

### Owner issues/RFCs

#17, #18, #40, #42, #43, #45. RFC-0002, protocolo de Action e StateBasis como hipótese.

## Cena 3. Commit e contenção

### Preconditions

Duas Actions concorrentes pedem o mesmo recurso exclusivo. Premissa do caso.

- Agente de planejamento tenta commitar compra reduzida e reservar o lote `LOT-IN-8841` para `PED-1001`.
- Agente de contenção tenta reservar o mesmo slice de `LOT-IN-8841` para o pedido `PED-1002`.

Premissa do caso. O ATP disponível do mesmo slice de `LOT-IN-8841`, após as demais alocações, é exatamente 6 unidades na base compartilhada pelas duas reservas. A invocação A pede 6 unidades para `PED-1001`. A invocação B pede as mesmas 6 unidades para `PED-1002`. O recebimento `RCV-LOT-IN-8841-01` de 800 unidades da cena 2 permanece. As demais alocações que deixam 6 unidades disponíveis também são premissa do caso. Este Casebook não escolhe o mecanismo de transação.

On-hand não é available. Reserva é claim, não movimento. [`research/domain/inventory/candidate-laws.md`](../research/domain/inventory/candidate-laws.md) L-INV-03, L-INV-04, L-INV-15. `research/domain/o2c/candidate-laws.md`, L-004.

Em paralelo, o teto de autoridade de compra do agente de planejamento não cobre 1000 após a releitura. `research/runtime/transactions/commit-contract.md`, seção 5.2.

### Observations

1. ATP corrente do lote `LOT-IN-8841` após o recebimento `RCV-LOT-IN-8841-01` e após as demais alocações. Valor observado, 6 unidades no mesmo slice. Kind, observação do WMS. Premissa do caso para o valor 6.
2. Duas propostas de reserva sobre o mesmo slice e a mesma base. Invocação A pede 6 unidades para `PED-1001`. Invocação B pede as mesmas 6 unidades para `PED-1002`. Kind, observações de intenção.
3. Grant `G-PLAN-01` com teto abaixo de 1000 na revisão corrente. Kind, observação de política.

### Decisions

O commit de cada reserva relê o mesmo slice na mesma base. A fatia inclui especificação, grão de identidade, local e dono ou custodiante. `research/domain/inventory/candidate-laws.md`, L-INV-15.

As duas reservas pedem 12 unidades no ATP disponível de 6 unidades. No máximo uma reserva consome as 6 unidades. A outra recebe recusa visível ou `NeedsReproposal`. Não há consumo duplo das mesmas 6 unidades. Este Casebook não escolhe o mecanismo de transação.

A compra de 1000 não commita sob a aprovação stale. Uma reproposta pode usar quantidade menor dentro do teto vigente. S-003.

### Actions

**Action `ReserveLotSlice`.** Duas invocações concorrentes.

- Objetivo. Obter claim exclusivo sobre quantidade do lote `LOT-IN-8841` para um pedido.
- Parâmetros. Invocação A, `lot=LOT-IN-8841`, `qty=6`, `purpose=PED-1001`. Invocação B, `lot=LOT-IN-8841`, `qty=6`, `purpose=PED-1002`. Premissa do caso para as quantidades.
- Ator de negócio. Agente de planejamento na A. Agente de contenção na B.
- Representado. Organização Alfa em ambas.
- Delegação. `G-PLAN-01` na A. `G-CONT-01` na B.
- Base de estado. Predicado corrente compartilhado pelas duas invocações. ATP disponível do mesmo slice, 6 unidades. Cada invocação pede 6 unidades. `research/runtime/transactions/commit-contract.md`, seção 3.6.
- Revisão semântica relevante. Revisão da regra de reserva e da identidade de lote.
- Autorização ou aprovação exigida. Grant vigente no commit. A aprovação stale da cena 2 não autoriza a reserva.
- Efeito externo previsto. não aplicável.
- Responsabilidade legal. Organização Alfa. Os agentes não adquirem o lote.

**Action `CommitPurchase`.**

- Objetivo. Abrir compromisso de compra com Gama dentro do teto e da base corrente.
- Parâmetros. Quantidade reavaliada, menor que 1000 se a base stale cair. Fornecedor, organização Gama no papel supplier. Código de Gama permanece `GAMA-PA-220`. SKU de Alfa não é enviado como identidade universal.
- Ator de negócio. Agente de planejamento.
- Representado. Organização Alfa.
- Delegação. `G-PLAN-01` mais aprovação humana vigente para os parâmetros novos, se a quantidade ou o fornecedor mudarem. `research/runtime/transactions/commit-contract.md`, seção 5.1.
- Base de estado. ATP corrente, teto corrente, proposta nova ou reproposta. Não a base das 10:01.
- Revisão semântica relevante. Revisão da Action de compra no commit.
- Autorização ou aprovação exigida. Reaprovação se os parâmetros saírem do envelope aprovado. O aprovador humano, quando exigido, é o gerente de compras. Premissa do caso.
- Efeito externo previsto. Pedido de mudança no sistema de Gama, criado como EffectRequest distinto. Issue #41. Ainda não executado nesta Action se o contrato for local-first. `research/runtime/effects/effect-contract.md`, seção 12.1. A ordem local-first versus remote-first permanece sem vencedor genérico. `research/runtime/effects/effect-contract.md`, seção 12.3.
- Responsabilidade legal. Organização Alfa.

### Expected results

No máximo uma das duas reservas consome as mesmas 6 unidades. A outra recebe recusa visível ou `NeedsReproposal`. Compra de 1000 não entra. Uma compra menor pode entrar se a base e a autoridade correntes permitirem. Reserva não altera on-hand. `research/domain/inventory/candidate-laws.md`, L-INV-04.

### Invariants

- Duas Actions não consomem as mesmas 6 unidades exclusivas do slice. `research/domain/inventory/candidate-laws.md`, L-INV-15.
- Commit local é atômico no recorte declarado. Não há meia reserva. `research/runtime/transactions/commit-contract.md`, seção 7.3.
- Aprovação stale não viaja com parâmetros novos. `research/runtime/transactions/commit-contract.md`, seção 5.1.

### Falsifier

Uma observação de que as duas reservas consumiram as mesmas 6 unidades de `LOT-IN-8841`, ou de commit da compra 1000 sob a aprovação das 10:01 após o recebimento `RCV-LOT-IN-8841-01`, derrota a claim. Um mutex narrativo sem o ATP de 6 unidades na precondição também derrota a claim.

### Owner issues/RFCs

#18, #19, #40, #42, #46. RFC-0002, commit local e RuleBinding como hipótese. #46 é o dono da verificação automática dessas invariantes, não desta prosa.

## Cena 4. Cadeia chinesa e efeito externo

### Preconditions

Alfa commitou localmente uma compra reduzida `PO-ALFA-220`. O commit local criou o EffectRequest `ER-GAMA-220` para o sistema de Gama. `research/runtime/effects/effect-contract.md`, seção 1. Premissa do caso para os identificadores.

Gama opera um sistema de registro próprio. Fontes chinesas de primeira parte descrevem commit por capacidade nomeada sobre ERP ou plataforma, não por chat livre. [yonyou.com/news/4948](https://www.yonyou.com/news/4948). [kingdee.com](https://www.kingdee.com/resources/articles/1519374747954812097). MIIT 2025-279 pede adapters agente-sistema industrial e manutenção de MES, DCS e SCADA. [nda.gov.cn](https://www.nda.gov.cn/sjj/zwgk/zcfb/0112/20260107214358696030895_pc.html).

### Observations

1. Tentativa `A1` de `ER-GAMA-220` sai pelo workload W-GAMA. Kind, evidência de tentativa.
2. A conexão expira antes da resposta. Transporte, `SentNoResponse` ou `TransportIndeterminate`. `research/runtime/effects/effect-contract.md`, seções 4 e 4.2. Kind, observação de transporte. S-004.
3. Nenhum RemoteReceiptId foi aprendido. Kind, ausência observada. `research/runtime/effects/effect-contract.md`, seção 2.4.
4. A UI local não é fonte de resultado remoto.

### Decisions

O resultado de negócio de `ER-GAMA-220` permanece `unknown`. Timeout não prova falha. `docs/constitution.md`, artigos 8 e 9. `docs/open-questions.md` Q5.

Retry cego é recusado enquanto o protocolo de Gama não oferecer lookup autoritativo ou chave de dedupe remota com garantia adequada. `research/runtime/effects/effect-contract.md`, seção 6, casos C e D.

Reconciliação é procedimento posterior que cita evidência. Não é um segundo pedido. `research/runtime/effects/effect-contract.md`, seção 9.

### Actions

**Action `RequestSupplierOrderEffect`.** Já causada pelo commit local. A execução remota é do executor de efeito, não uma segunda Action de negócio.

- Objetivo. Pedir que Gama registre o pedido correspondente a `PO-ALFA-220`.
- Parâmetros. `effect_request=ER-GAMA-220`, `local_operation=PO-ALFA-220`, `supplier_code=GAMA-PA-220`, quantidade commitada, chave de correlação se o protocolo de Gama aceitar uma.
- Ator de negócio. Agente de cadeia.
- Representado. Organização Alfa.
- Delegação. `G-CADEIA-01`, limitada a este EffectRequest. Sem alargamento para outros fornecedores.
- Base de estado. EffectRequest durável ligado à operação local. Se o commit local estiver `CommitOutcomeIndeterminate`, não se fabrica `ER-GAMA-221`. `research/runtime/effects/effect-contract.md`, seção 11. `research/runtime/transactions/commit-contract.md`, seção 10.
- Revisão semântica relevante. Revisão do capability contract do conector de Gama.
- Autorização ou aprovação exigida. Grant `G-CADEIA-01` e credencial do workload W-GAMA.
- Efeito externo previsto. Mutação possível no sistema de Gama. O resultado pode permanecer indeterminado.
- Responsabilidade legal. Organização Alfa perante Beta e perante o contrato com Gama. Gama responde pelos atos da pessoa jurídica chinesa no direito aplicável à relação. Este Casebook não escolhe o foro.

### Expected results

Identidades distintas permanecem. Operação local, EffectRequest, Attempt `A1`, observação de timeout e julgamento de reconciliação. Nenhuma ocorrência de "pedido aceito por Gama" é afirmada.

YonClaw lista interceptação e confirmação humana como campos de auditoria. [yonyou.com/news/4948](https://www.yonyou.com/news/4948). Isso é evidência de produto chinês, não prova de que Gama usa YonClaw.

### Invariants

- Action local commitada não é ocorrência remota. `research/domain/p2p/candidate-laws.md`, L4. `research/runtime/effects/effect-contract.md`, seção 1.
- `unknown` é condição epistêmica. Não é status de negócio de Gama. `research/runtime/effects/effect-contract.md`, seção 5.4.
- AttemptId novo sob o mesmo EffectRequestId só ocorre quando o contrato diz que é nova tentativa do mesmo efeito. `research/runtime/effects/effect-contract.md`, seção 2.5.

### Falsifier

Uma observação de que o timeout foi gravado como falha definitiva, ou de que um retry criou um segundo pedido remoto sem reconciliação, derrota a claim. Presumir sucesso para "não atrasar Beta" também derrota a claim.

### Owner issues/RFCs

#17, #31, #40, #41, #43. RFC-0002, EffectRequest como contrato padrão ou capability de runtime, ainda em disputa na RFC. #70 não fecha o vencedor.

## Cena 5. Recebimento, produção e efeito físico

### Preconditions

Gama envia componentes. Alfa recebe, inspeciona, monta com a célula R-01, entrega a Beta, escritura e pratica atos fiscais. Custódia, direitos e risco podem mudar em tempos diferentes. `research/domain/p2p/candidate-laws.md`, L5. Quantidade chegada, aceita, rejeitada e disponível para uso podem diferir. `research/domain/p2p/candidate-laws.md`, L6.

Especificação, autorização de produção e execução são três fatos. [`research/domain/manufacturing/candidate-laws.md`](../research/domain/manufacturing/candidate-laws.md) L1. Reserva, issue e consumo são distintos. `research/domain/manufacturing/candidate-laws.md`, L5.

### Observations

Recebimento `RCV-LOT-IN-8841-02` do lote `LOT-IN-8841`, com `occurred_at=2026-08-11T15:00:00-03:00`. Premissa do caso para o identificador e o tempo. A alegação de 6 unidades e a contagem de 5 são observações rivais sobre `RCV-LOT-IN-8841-02`. Este Casebook não cria dois recebimentos e não resolve a quantidade aceita.

1. Aviso de Gama. Enviou 6 unidades de `GAMA-PA-220`, lote `LOT-IN-8841`. Kind, observação do fornecedor. Observação rival sobre `RCV-LOT-IN-8841-02`.
2. Portaria de Alfa. Contagem 5 unidades no mesmo lote. Kind, observação de inspeção. Observação rival sobre `RCV-LOT-IN-8841-02`.
3. WMS de Alfa. Bin de quarentena, 5 unidades, ainda sem aceite. Kind, observação de sistema. S-011. Observação posterior sobre `RCV-LOT-IN-8841-02`.
4. Célula R-01. O robô executa o aperto do conjunto `SN-R01-0007`. O sensor registra torque e timestamp. Kind, evidência de sensor. Premissa do caso para o serial e para o tipo de grandeza. Este Casebook não inventa limiar de torque.
5. Agente de planta alega ocorrência `JobCompleted` para `SN-R01-0007`. Kind, ocorrência alegada, não resultado aceito.
6. Entrega a Beta de 4 conjuntos acabados. Kind, observação de expedição. S-002.
7. Minuta de NF-e gerada localmente. Kind, registro interno. Não é autorização de uso. [`research/domain/fiscal/candidate-laws.md`](../research/domain/fiscal/candidate-laws.md) CL-003, CL-005. [Ajuste SINIEF 07/05](https://www.confaz.fazenda.gov.br/legislacao/ajustes/2005/AJ007_05).
8. Protocolo do autorizador, se chegar. Kind, evidência externa. Distinta do DANFE. `research/domain/fiscal/candidate-laws.md`, CL-003.

A situação tributável não é o documento comercial. `research/domain/fiscal/candidate-laws.md`, CL-001. [CTN, arts. 113 a 118, texto compilado](https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm). Fatura ou duplicata não é o documento fiscal. `research/domain/fiscal/candidate-laws.md`, CL-004. [Lei 5.474/1968, arts. 1 e 2](https://planalto.gov.br/ccivil_03/leis/l5474.htm).

2026 é ano de teste de CBS e IBS na orientação corrente da Receita. Campos novos no DF-e não equivalem a arrecadação normal. [`research/domain/fiscal/current-law-2026-review.md`](../research/domain/fiscal/current-law-2026-review.md). [Orientações 2026](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026). [LC 214 compilada](https://planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm).

### Decisions

Alfa não resolve a divergência 6 versus 5 por sobrescrita. Matching compara. Não funde. `research/domain/p2p/candidate-laws.md`, L8.

A célula R-01 produz efeito físico. O aceite do resultado de montagem é decisão posterior, distinta do pedido, da Action `StartJob`, da ocorrência alegada e da evidência do sensor. `research/domain/manufacturing/candidate-laws.md`, L1, L3, L16.

A classificação NCM usada no DF-e é decisão governada do responsável fiscal, com revisão de regra pinada. Premissa do caso para a autoria pessoal desta classificação. `research/domain/fiscal/candidate-laws.md`, CL-009. Os códigos locais de Alfa não viram conceitos universais. `research/domain/fiscal/candidate-laws.md`, CL-010. `docs/constitution.md`, artigo 12.

Lançamento contábil é Action de posting distinta da entrega e do DF-e. Journal rascunho não afeta os livros. [`research/domain/accounting/candidate-laws.md`](../research/domain/accounting/candidate-laws.md) L1, L2, L8, L13. Documento operacional não é automaticamente o journal.

### Actions

**Action `RecordInboundCustody`.**

- Objetivo. Registrar custódia das unidades chegadas, sem aceitar qualidade e sem transferir direitos por padrão.
- Parâmetros. `receipt=RCV-LOT-IN-8841-02`, `lot=LOT-IN-8841`, quantidade chegada segundo a fonte escolhida para custódia, ainda não a quantidade aceita.
- Ator de negócio. Agente de planta.
- Representado. Organização Alfa.
- Delegação. `G-PLANTA-01`.
- Base de estado. Observações 1 a 3 permanecem. A Action declara qual quantidade de custódia usa.
- Revisão semântica relevante. Revisão da distinção custódia versus aceite.
- Autorização ou aprovação exigida. Grant de recebimento.
- Efeito externo previsto. não aplicável.
- Responsabilidade legal. Organização Alfa. Gama permanece responsável pelos componentes que enviou, no contrato aplicável.

**Action `StartJob`.**

- Objetivo. Autorizar a célula R-01 a montar um conjunto serializado.
- Parâmetros. `cell=R-01`, `serial=SN-R01-0007`, `authorization` da ordem de produção pinada à revisão de BOM. `research/domain/manufacturing/candidate-laws.md`, L13.
- Ator de negócio. Agente de planta.
- Representado. Organização Alfa.
- Delegação. `G-PLANTA-01`.
- Base de estado. Autorização aberta, material emitido, capacidade da célula. Falha de capacidade não inventa execução. `research/domain/manufacturing/candidate-laws.md`, L14.
- Revisão semântica relevante. Revisão da especificação copiada na autorização, não o BOM vivo.
- Autorização ou aprovação exigida. Liberação de produção prévia.
- Efeito externo previsto. Movimento físico do robô. O efeito não é a Action.
- Responsabilidade legal. Organização Alfa. O robô não é responsável.

**Action `PostDeliveryJournal`.**

- Objetivo. Escriturar o efeito contábil da entrega aceita, se a política de acoplamento desta operação exigir journal.
- Parâmetros. Contas folha, valores em moeda funcional, dimensões de gestão se houver. Quantidade entregue 4. Premissa do caso.
- Ator de negócio. Agente contábil.
- Representado. Organização Alfa.
- Delegação. `G-CONTAB-01`. Limitada ao posting contábil da entrega aceita.
- Base de estado. Período aberto. Débito igual a crédito na moeda funcional. `research/domain/accounting/candidate-laws.md`, L1, L7.
- Revisão semântica relevante. Revisão do plano de contas e da regra de reconhecimento.
- Autorização ou aprovação exigida. Policy de posting. Agente não improvisa conta de plug. `research/domain/accounting/candidate-laws.md`, L1.
- Efeito externo previsto. não aplicável.
- Responsabilidade legal. Organização Alfa. O workload executor permanece distinto do ator de negócio. Mudança de quantidade de estoque não é automaticamente Event de ledger. `research/domain/accounting/candidate-laws.md`, L11.

**Action `RequestNFeAuthorization`.**

- Objetivo. Pedir autorização de uso do documento eletrônico da operação, no modelo e na revisão aplicáveis.
- Parâmetros. Payload do modelo NF-e em uso, chave de acesso se o modelo a exigir, classificação e regra pinadas pelo responsável fiscal. Premissa do caso para a autoria pessoal desta pinagem.
- Ator de negócio. Agente fiscal.
- Representado. Organização Alfa.
- Delegação. `G-FISCAL-01`. Classificação final permanece com o responsável fiscal. Premissa do caso para este recorte operacional.
- Base de estado. Fatos da operação, jurisdição, regime e revisão legal efetiva. `research/domain/fiscal/candidate-laws.md`, CL-009. [`research/domain/fiscal/current-law-2026-review.md`](../research/domain/fiscal/current-law-2026-review.md).
- Revisão semântica relevante. Schema e nota técnica do modelo, mais a revisão da LC e da orientação da Receita então vigentes.
- Autorização ou aprovação exigida. Responsável fiscal assina a base. Premissa do caso para esta assinatura pessoal. Grant do agente cobre envio, não interpretação livre de NCM.
- Efeito externo previsto. Pedido ao autorizador. Resultado pode ser autorizado, rejeitado, contingência ou `unknown`. `research/domain/fiscal/candidate-laws.md`, CL-005. `research/runtime/effects/effect-contract.md`, seção 5. Não há enum legal universal para toda a família DF-e. `research/domain/fiscal/current-law-2026-review.md`, correção 2.
- Responsabilidade legal. Organização Alfa. O autorizador reconhece o documento no modelo. Não assume a obrigação tributária de Alfa. A menção ao responsável fiscal nesta Action é premissa do caso, não prova de responsabilidade pessoal deste cargo neste ato.

### Expected results

Pedido, Action, ocorrência alegada, evidência do sensor e resultado aceito permanecem cinco registros. Entrega, journal e DF-e permanecem três atos. Códigos `PLN-BOMBA-ACIO` e `SKU-BR-ACIO-01` não são exportados como leis universais.

Crédito de IBS ou CBS, se aplicável, não é o journal. `research/domain/fiscal/candidate-laws.md`, CL-011. LC 214 arts. 47 e 48 no texto compilado citado em [`research/domain/fiscal/current-law-2026-review.md`](../research/domain/fiscal/current-law-2026-review.md).

### Invariants

- Chegada, aceite, rejeição e disponível para uso não são um campo. `research/domain/p2p/candidate-laws.md`, L6.
- Consumo e produção da montagem são transformação, não transferência. `research/domain/inventory/candidate-laws.md`, L-INV-11. `research/domain/manufacturing/candidate-laws.md`, L12.
- Payload local, pedido de autorização e protocolo externo não colapsam. `research/domain/fiscal/candidate-laws.md`, CL-003, CL-005.
- CFOP, CST, CSOSN, CRT, CEST e NCM ou TIPI ficam em definições brasileiras. Não entram no motor genérico. `research/domain/fiscal/candidate-laws.md`, CL-010. `docs/constitution.md`, artigo 12.

### Falsifier

Uma observação de que o torque do sensor foi tratado como aceite legal, ou de que a minuta local foi tratada como NF-e autorizada, ou de que o código `GAMA-PA-220` foi promovido a tipo universal, derrota a claim. Transformar o robô em parte responsável também derrota a claim.

### Owner issues/RFCs

#15, #16, #17, #18, #19, #21, #30, #31, #41, #45. RFC-0002 não decide se ocorrência é primitiva.

## Cena 6. Correção, known-then e revisão ontológica

### Preconditions

Decisões das cenas 1 a 5 já ocorreram sob o conhecimento de então. Em 12 de agosto chega o documento tardio `EVID-LOT-IN-8841-LATE-01`. Premissa do caso para o identificador. O documento alega a saída `MOV-LOT-IN-8841-OUT-01` de 20 unidades do lote `LOT-IN-8841`, com `valid_on=2026-08-08`. Premissa do caso para o identificador e o valid time. `EVID-LOT-IN-8841-LATE-01` tem `known_on=2026-08-12` e se liga a `MOV-LOT-IN-8841-OUT-01`. Premissa do caso para o known time. S-007. V-001, passo 11. Este Casebook não afirma que a saída alegada ocorreu.

`RCV-LOT-IN-8841-01`, `RCV-LOT-IN-8841-02`, `MOV-LOT-IN-8841-OUT-01` e `EVID-LOT-IN-8841-LATE-01` são identidades distintas ligadas ao mesmo lote `LOT-IN-8841`. Premissa do caso.

Em data posterior, Alfa revisa a ontologia ou a política de classificação do âncora. A revisão 2 trata `GAMA-PA-220` como especificação distinta de `SKU-BR-ACIO-01` de forma mais estrita, ou altera a política de desconto usada na cena 1. S-012. Premissa do caso para o teor exato da revisão. Este Casebook não escolhe o diff.

### Observations

1. Documento tardio `EVID-LOT-IN-8841-LATE-01` de Gama, ligado à saída alegada `MOV-LOT-IN-8841-OUT-01`, com `valid_on=2026-08-08` e `known_on=2026-08-12`. Kind, observação com valid time e known time distintos. `research/domain/inventory/candidate-laws.md`, L-INV-08. `docs/open-questions.md` Q7.
2. Saldos e ATP que as cenas 2 e 3 usaram em 10 e 11 de agosto. Kind, projeções then-known.
3. Revisão 2 de ontologia ou política, com identificador de conteúdo. Kind, observação de definição. RFC-0002, binding de revisão. `docs/open-questions.md` Q19.
4. Manifestação do destinatário, se Beta registrar ciência, desconhecimento ou operação não realizada. Kind, asserção oficial distinta da autorização do emitente. `research/domain/fiscal/candidate-laws.md`, CL-008.

### Decisions

O entendimento corrente de estoque em 8 de agosto muda. O conhecimento que o agente tinha em 10 de agosto não é reescrito. `research/domain/inventory/candidate-laws.md`, L-INV-08, L-INV-16. `docs/constitution.md`, artigos 10 e 11.

A Action histórica da cena 1 continua explicável sob a revisão 1. Replay sob a revisão 2 não é a explicação do desconto ou do aceite original. S-012. `research/runtime/transactions/commit-contract.md`, seção 11.

Correção fiscal, se a lei do modelo exigir, produz evento ou documento novo. Não apaga o payload autorizado como se nunca tivesse existido. `research/domain/fiscal/candidate-laws.md`, CL-006, CL-007. [Ajuste SINIEF 44/20](https://www.confaz.fazenda.gov.br/legislacao/ajustes/2020/ajuste-sinief-44-20) e [Ajuste SINIEF 13/24](https://www.confaz.fazenda.gov.br/legislacao/ajustes/2024/AJ013_24) no registro de [`research/domain/fiscal/sources.md`](../research/domain/fiscal/sources.md).

Responsabilidade legal permanece na Organização Alfa. Gama e Beta permanecem pessoas jurídicas nas relações que o caso já atribui a elas. Agente, workload e robô não herdam essa responsabilidade porque a ontologia mudou. Representante legal, gerente de compras e responsável fiscal permanecem identidades do elenco. Premissa do caso. Este Casebook não cita lei primária que prove responsabilidade pessoal desses cargos pelos atos das cenas 1 a 5.

### Actions

**Action `RecordLateStockEvidence`.**

- Objetivo. Registrar o documento tardio `EVID-LOT-IN-8841-LATE-01` como evidência com valid time em 8 de agosto e known time em 12 de agosto. A Action registra evidência. Não presume que a saída alegada `MOV-LOT-IN-8841-OUT-01` ocorreu.
- Parâmetros. `evidence=EVID-LOT-IN-8841-LATE-01`, `alleged_occurrence=MOV-LOT-IN-8841-OUT-01`, `lot=LOT-IN-8841`, quantidade 20, `valid_on=2026-08-08`, `known_on=2026-08-12`, fonte documento Gama.
- Ator de negócio. Agente de planta.
- Representado. Organização Alfa.
- Delegação. `G-PLANTA-01`, só para registrar evidência. Sem poder de apagar reservas históricas.
- Base de estado. O documento é referência imutável. `research/runtime/transactions/commit-contract.md`, seção 3.4. Projeções dependentes marcam stale. `research/domain/inventory/candidate-laws.md`, L-INV-08.
- Revisão semântica relevante. Revisão 1 para explicar decisões antigas. Revisão 2 só para atos novos.
- Autorização ou aprovação exigida. Grant de correção. Período pode exigir override se já houver lock. `research/domain/accounting/candidate-laws.md`, L7, L15.
- Efeito externo previsto. não aplicável, salvo novo EffectRequest se Gama ou o autorizador fiscal tiverem de ser notificados por ato próprio.
- Responsabilidade legal. Organização Alfa. A correção não transfere responsabilidade ao agente que registrou o documento.

**Action `ReviseOntologyOrPolicy`.**

- Objetivo. Publicar a revisão 2 que altera a relação entre código de Gama e SKU brasileiro, ou a política usada no aceite.
- Parâmetros. Identificador de conteúdo da revisão 2, escopo do diff, data efetiva para atos novos.
- Ator de negócio. Agente de governança.
- Representado. Organização Alfa.
- Delegação. `G-GOV-01`. Limitada à publicação da revisão 2 para atos novos. Revisão humana exigida. Sem poder de reescrever Actions históricas.
- Base de estado. Revisão 1 permanece recuperável.
- Revisão semântica relevante. A própria revisão 2, e a regra de compatibilidade que impede commit de proposta da revisão 1 sob interpretação da revisão 2 sem reproposta. `research/runtime/transactions/commit-contract.md`, seção 11.1. RFC-0002, hipótese.
- Autorização ou aprovação exigida. Revisão humana de governança. `docs/constitution.md`, artigo 17. RFC-0002 não está aceito. `docs/open-questions.md` Q20 permanece aberta.
- Efeito externo previsto. não aplicável.
- Responsabilidade legal. Organização Alfa. A revisão de modelo não cria responsabilidade no motor, no agente ou no robô.

### Expected results

Perguntas temporais permanecem respondíveis. O que o sistema sabia em 10 de agosto. O que agora se acredita ter sido verdadeiro em 10 de agosto. S-007. Auditor consegue citar a revisão usada em cada Action. S-012.

Se a jornada só puder ser contada mutando o passado sob a revisão 2, o Casebook registra falha. Não há hatch narrativo.

### Invariants

- Valid time e known time não são um timestamp. Q7. `research/domain/inventory/candidate-laws.md`, L-INV-08.
- Correção acrescenta fato. Não apaga ocorrência. `research/domain/inventory/candidate-laws.md`, L-INV-16. `research/domain/accounting/candidate-laws.md`, L3. `research/domain/fiscal/candidate-laws.md`, CL-006.
- Action histórica cita a revisão sob a qual foi interpretada. RFC-0002 e `research/runtime/transactions/commit-contract.md`, seção 11, ambos hipótese de runtime e de metamodelo.

### Falsifier

Uma observação de que o saldo conhecido em 10 de agosto foi substituído pelo saldo agora acreditado, ou de que o aceite da cena 1 foi reexplicado só com a revisão 2, derrota a claim. Tratar o cursor de orquestração da revisão como o sujeito legalmente responsável também derrota a claim.

### Owner issues/RFCs

#15, #18, #21, #30, #40, #42, #43, #45, #46, #70. RFC-0002. Q19 e Q20 em `docs/open-questions.md` permanecem abertas.

## Gaps expostos pela jornada

Cada item aponta a um owner existente ou fica `sem owner identificado`. O Casebook não fecha pergunta aberta por autoridade própria.

1. Qual NCM ou TIPI cabe ao conjunto de acionamento permanece divergência do caso. Owner, #30. A TIPI é a autoridade de incidência de IPI. [S-TIPI](../research/domain/fiscal/sources.md). Este documento não classifica o produto.
2. Incoterms, título e risco na rota China e Brasil não foram pinados por fonte primária deste caso. Owner, `sem owner identificado`. #17 e #18 cobrem custódia versus direitos. Não cobrem o Incoterm desta viagem.
3. O protocolo real de Gama, chave de dedupe remota e janela de retenção, é desconhecido. Owner, #41. Fontes chinesas descrevem o mercado, não o endpoint de Gama.
4. A ordem local-first versus remote-first não tem vencedor. Owner, #41. `research/runtime/effects/effect-contract.md`, seção 12.3.
5. Se Effect é primitiva, Type ordinário ou só capability de runtime permanece em disputa. Owner, #70 e RFC-0002. Não aceito.
6. Se reserva é Commitment, relator ou figura de estoque permanece `undetermined`. Owner, #18. `docs/open-questions.md` Q12.
7. Acoplamento entre movimento de estoque e journal não tem trigger único. Owner, #21. `research/domain/accounting/candidate-laws.md`, L11, L13.
8. Quanto da classificação fiscal é Function determinística e quanto é decisão governada permanece aberto. Owner, #30. `research/domain/fiscal/current-law-2026-review.md`, correção 3.
9. Crédito de IBS ou CBS e o vínculo com extinção do débito não têm modelo de ligação fechado. Owner, #30. `research/domain/fiscal/candidate-laws.md`, CL-011, `undetermined` no detalhe.
10. Identidade de quote versus pedido aceito não é lei de domínio. Owner, #16. `research/domain/o2c/candidate-laws.md`, L-012.
11. O Casebook não mede latência, acurácia, custo, volume, taxa de erro ou limiar. Owner, `sem owner identificado`. #80 pedirá critérios de parada. #71 pedirá suíte executável. Nenhum dos dois é este arquivo.
12. Inspeção, amostragem e disposition têm pasta em `research/domain/quality/`. Este Casebook não promove essa pasta a owner da cena 5. Owner da lacuna de qualidade fina, `sem owner identificado` na lista do brief.

## O que este documento não faz

Não escolhe stack, linguagem, sintaxe, banco, mecanismo de transação, orquestrador, framework de agentes, metamodelo final ou métrica. Não transforma RFC-0002 em arquitetura aceita. Não implementa o scorecard #80 nem a suíte #71. Não resolve divergência por estética.
