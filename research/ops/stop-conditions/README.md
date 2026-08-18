# Scorecard executável de readiness

Este diretório responde à issue #80. A pergunta é quando o corpus tem evidência suficiente para um experimento, quando tem evidência suficiente para um bakeoff de stack, e quando bloqueia promoção arquitetural.

O critério é evidência suficiente para experimentar. Não é certeza. Não é ontologia empresarial completa.

## A pergunta

Pesquisa pode continuar para sempre como arqueologia de arquitetura. A issue #80 pede um scorecard que derive o momento de parar ou mudar de modo a partir de evidência localizada.

Os três gates são independentes. Uma assessment pode autorizar experimento e bloquear bakeoff e promoção no mesmo documento. Eles não formam um enum de fase única.

## Os três gates

`experiment` autoriza pesquisa experimental limitada. Exige pergunta limitada, hipótese com falsificador, prova executável discriminante, fonte ou rótulo de inferência, limites e ausência de promoção normativa. O resultado é `allow` ou `block`.

`stack_bakeoff` autoriza comparação entre candidatos. Exige suíte implementation-neutral publicada, pelo menos dois candidatos nas mesmas entradas e medidas, contratos semânticos que impedem a stack de escolher o significado, questões bloqueantes já limitadas e recusa de exceção source-shaped. O resultado é `allow` ou `block`.

`architectural_promotion` nunca autoriza arquitetura. O máximo é `eligible_for_governance_review`. Elegibilidade exige evidência cross-domain e cross-industry, kill tests principais respondidos ou limitados, semântica de alto risco executável, competidores reduzidos, review do SHA atual e um locator para o processo de governança separado. O gate também pode retornar `block`. Ele nunca retorna `allow` ou `accepted`.

## Readiness não é aceitação

Publicar em `research-corpus` preserva evidência. Não aprova arquitetura. `supported` é corroboração. `accepted` é adoção e só pode nascer num processo de governança separado.

`criteria.json` é a tabela única de critérios e derivação. `evaluate_scorecard.py` aplica essa tabela. Ele rejeita `gate_results` escritos à mão que não coincidam com a derivação.

A assessment classifica questões abertas como bloqueantes ou limitadas para um alvo. Ela não responde `docs/open-questions.md` e não fecha #80, #70 ou #71.

## A assessment atual

`current-assessment.json` avalia o SHA `a749fb7a8d4e4c59ef7f508d5dd662449d858f39` de `origin/research-corpus`. A data é o instante real da avaliação em 2026. 2030 não é data de evidence assessment.

O resultado derivado neste SHA é experimento `allow`, bakeoff `block` e promoção `block`. A suíte #71 não está publicada. Não há dois candidatos executados contra as mesmas medidas. Q-015, Q-018, Q-021 e Q-002 permanecem abertas. R5 permanece `hypothesis`. A review-clean de síntese aponta outro SHA.

Nenhuma célula desta assessment deriva readiness de issue aberta, branch existente ou CI verde.

## Limites

O scorecard autoriza pesquisa experimental e comparação. Ele não escolhe stack, linguagem, storage, metamodelo, R5, R6 ou arquitetura.

Ausência de uma alternativa no failure archive não prova falsificação. O scorecard de `research/kill/existing-platform/scorecard.md` mede um kill já executado. Ele não é este readiness scorecard.

O avaliador é `evaluate_scorecard.py`. A interface humana está em português do Brasil. Chaves, IDs e enums permanecem em inglês.
