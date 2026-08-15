# Origem dos pacotes

Cópias vendidas neste repo. Atualize sobrescrevendo a pasta e a cópia em `.cursor/`.

| Pacote | Versão | Origem | O que ficou de fora |
| --- | --- | --- | --- |
| pstack | 0.14.1 | [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/main/pstack) | — |
| cursor-team-kit | 1.2.0 | [cursor/plugins/cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) | — |
| mattpocock/skills | `068b6e0c62393147daf03530149cdce209c93da8` | [mattpocock/skills](https://github.com/mattpocock/skills) | `tdd` e `teach` (mesmo nome no pstack); pastas `in-progress/` e `deprecated/` |

## Como atualizar

```bash
# pstack e cursor-team-kit: baixe o repo cursor/plugins e rsync as pastas
# mattpocock: clone e rsync skills/ para .cursor/skills/mattpocock/
# de novo, exclua tdd/, teach/, in-progress/, deprecated/
```
