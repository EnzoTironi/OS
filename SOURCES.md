# Origem dos pacotes

Cópias vendidas neste repo. Atualize sobrescrevendo o pacote em `.cursor/plugins/` e a cópia carregada em `.cursor/skills/` e `.cursor/agents/`.

| Pacote | Versão | Origem | O que ficou de fora |
| --- | --- | --- | --- |
| pstack | 0.14.1 | [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/main/pstack) | — |
| cursor-team-kit | 1.2.0 | [cursor/plugins/cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) | — |
| mattpocock/skills | `068b6e0c62393147daf03530149cdce209c93da8` | [mattpocock/skills](https://github.com/mattpocock/skills) | `tdd` e `teach` (mesmo nome no pstack); pastas `in-progress/` e `deprecated/` |

## Onde cada cópia vive

| Caminho | Função |
| --- | --- |
| `.cursor/plugins/<pacote>/` | Pacote marketplace completo (`plugin.json`, skills, agents, docs) |
| `.cursor/skills/<pacote>/` | O que o agente carrega no desktop e na cloud |
| `.cursor/agents/`, `.cursor/rules/` | Agents e rules já instalados |
| `.cursor-plugin/marketplace.json` | Manifesto local; `source` aponta para `.cursor/plugins/` |

Não coloque pstack nem cursor-team-kit na raiz. A raiz é o OS: `docs/`, `research/`, `rfcs/`, `scenarios/`.

## Como atualizar

```bash
# pstack e cursor-team-kit: clone cursor/plugins e rsync para
#   .cursor/plugins/<pacote>/
#   .cursor/skills/<pacote>/   (conteúdo de <pacote>/skills/)
#   .cursor/agents/            (arquivos de <pacote>/agents/)
# mattpocock: clone e rsync skills/ para .cursor/skills/mattpocock/
# exclua tdd/, teach/, in-progress/, deprecated/
```
