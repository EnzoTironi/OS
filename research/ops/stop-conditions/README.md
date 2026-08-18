# Scorecard executável de readiness

Este diretório responde à issue #80. A pergunta é quando o corpus tem evidência suficiente para um experimento, quando tem evidência suficiente para um bakeoff de stack, e quando bloqueia promoção arquitetural.

O critério é evidência suficiente para experimentar. Não é certeza. Não é ontologia empresarial completa.

## A pergunta

Pesquisa pode continuar para sempre como arqueologia de arquitetura. A issue #80 pede um scorecard que derive o momento de parar ou mudar de modo a partir de evidência localizada.

Os três gates são independentes. Uma assessment pode autorizar experimento e bloquear bakeoff e promoção no mesmo documento. Eles não formam um enum de fase única.

## Input v2

`current-assessment.json` e as fixtures declaram somente fatos estruturados: alvo avaliado, evidence items, questões abertas e os três evidence cases. O input não contém `criteria`, `status`, rationale autoral nem `gate_results`.

`experiment_case` registra pergunta, hipótese, falsificador, limites, promoção normativa e as refs de cada fato. `stack_bakeoff_case` registra a suíte, candidatos com `candidate_id`, medidas, contratos e o flag source-shaped. `architectural_promotion_case` registra flags de demonstração, o SHA revisado, a review, a governança e `adoption_claim`.

Uma questão aberta entra como `blocking` ou `limited`. O catálogo informa locator e gates bloqueados. A assessment não escreve `blocks`.

## Output derivado

`evaluate_scorecard.py` valida o schema e o catálogo empacotados, resolve o SHA e a ref do alvo, indexa evidência, resolve refs e locators no tree daquele SHA, deriva blockers e interpreta as regras de `criteria.json` com operadores genéricos.

O JSON emitido inclui `criteria` e os três `gate_results`. Status, rationale e gates nascem dessa derivação. Rationale usa códigos estáveis e mensagem em português do Brasil.

## Resolução no SHA

`assessed_target.sha` precisa existir como commit. `assessed_target.ref` precisa resolver para o mesmo commit. Cada locator contado usa path presente nesse tree e âncora como substring literal do blob. O resolver chama somente git plumbing com argv fixo e `shell=False`. Assessment e catálogo não carregam comandos.

## Block válido versus input inválido

Falta de evidência com shape íntegro é assessment válida. O avaliador retorna exit `0` e o gate em `block`.

Contrato inválido, SHA inexistente, ref pendente, locator irresolvível, omissão de blocker catalogado ou `assessed_at` no futuro retornam exit `1`. Schema ou catálogo empacotado inválido retorna exit `3`, JSON determinístico e nenhum traceback. Leitura, UTF-8, decode e parse de input retornam exit `2`.

## Os três gates

`experiment` autoriza pesquisa experimental limitada. Exige pergunta limitada, hipótese com falsificador, prova executável discriminante, fonte ou rótulo de inferência, limites e ausência de promoção normativa. O resultado é `allow` ou `block`.

`stack_bakeoff` autoriza comparação entre candidatos. Exige suíte implementation-neutral publicada, pelo menos dois `candidate_id` distintos com refs de execução, contratos semânticos, questões bloqueantes já limitadas e recusa de exceção source-shaped. O resultado é `allow` ou `block`.

`architectural_promotion` nunca autoriza arquitetura. O máximo é `eligible_for_governance_review`. Elegibilidade exige evidência cross-domain e cross-industry, kill tests principais respondidos ou limitados, semântica de alto risco executável, competidores reduzidos, review do SHA atual e uma ref para o processo de governança separado. O gate também pode retornar `block`. Ele nunca retorna `allow` ou `accepted`.

## Readiness não é aceitação

Publicar em `research-corpus` preserva evidência. Não aprova arquitetura. `supported` é corroboração. `accepted` é adoção e só pode nascer num processo de governança separado.

`criteria.json` é a tabela única de critérios e derivação. `evaluate_scorecard.py` só implementa operadores e percorre dados.

A assessment classifica questões abertas como bloqueantes ou limitadas. Ela não responde `docs/open-questions.md` e não fecha #80, #70 ou #71.

## A assessment atual

`current-assessment.json` avalia o SHA `a749fb7a8d4e4c59ef7f508d5dd662449d858f39` de `origin/research-corpus`. A data é o instante real da avaliação em 2026. 2030 não é data de evidence assessment.

O resultado derivado neste SHA é experimento `allow`, bakeoff `block` e promoção `block`. `PRO-02` deriva `pass` a partir de `research/ops/cross-industry/README.md` e `research/ops/cross-industry/matrix.md`. A suíte #71 não está publicada. Não há dois candidatos executados contra as mesmas medidas. Q-001, Q-015, Q-018, Q-021, Q-002 e Q-071 permanecem bloqueantes. R5 permanece `hypothesis`. A review-clean de síntese aponta outro SHA.

Nenhuma célula desta assessment deriva readiness de issue aberta, branch existente ou CI verde.

## Limites

O scorecard autoriza pesquisa experimental e comparação. Ele não escolhe stack, linguagem, storage, metamodelo, R5, R6 ou arquitetura.

Ausência de uma alternativa no failure archive não prova falsificação. O scorecard de `research/kill/existing-platform/scorecard.md` mede um kill já executado. Ele não é este readiness scorecard.

O avaliador é `evaluate_scorecard.py`. A interface humana está em português do Brasil. Chaves, IDs e enums permanecem em inglês.
