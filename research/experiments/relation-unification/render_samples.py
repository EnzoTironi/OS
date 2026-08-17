#!/usr/bin/env python3
from __future__ import annotations

from models import (
    enterprise_relation_slice,
    generated_surface_map,
    inverse_surface,
    query_path,
    relation_physical_lowering,
    relation_statement_shape,
)


def render() -> str:
    relations = enterprise_relation_slice()
    surfaces = generated_surface_map()
    lines: list[str] = []
    lines.append("# Generated comparison samples")
    lines.append("")
    lines.append("**Generated from:** `models.py`. This file is illustrative output, not canonical architecture.")
    lines.append("")

    lines.append("## Authoring sugar over competitor A")
    lines.append("")
    lines.append("```text")
    for relation in relations:
        if not relation.binary:
            lines.append(f"relation {relation.name}(" + ", ".join(r.name for r in relation.roles) + ")")
            continue
        target = relation.object.target
        word = "property" if target.kind.value == "literal" else "link"
        lines.append(f"{word} {relation.name}: {surfaces['A'][relation.stable_id].split(': ', 1)[1]}")
    lines.append("```")
    lines.append("")
    lines.append("> `property` and `link` above are authoring views selected from endpoint Type semantics. They are not stored in competitor A's canonical IR.")
    lines.append("")

    lines.append("## Generated SDK-like views")
    lines.append("")
    lines.append("| relation | A unified | B Property+Link | C slot+Link | D tuple predicate |")
    lines.append("|---|---|---|---|---|")
    for relation_id in sorted(surfaces["A"]):
        lines.append(
            f"| `{relation_id}` | `{surfaces['A'][relation_id]}` | `{surfaces['B'][relation_id]}` | "
            f"`{surfaces['C'][relation_id]}` | `{surfaces['D'][relation_id]}` |"
        )
    lines.append("")

    lines.append("## Query/navigation samples — unified Relation")
    lines.append("")
    lines.append("```text")
    for relation in relations:
        if relation.binary:
            lines.append(query_path(relation, relation.subject.name))
            inv = inverse_surface(relation)
            if inv:
                lines.append(f"inverse {inv}")
        else:
            lines.append(query_path(relation, "scope"))
    lines.append("```")
    lines.append("")

    lines.append("## Physical-lowering examples")
    lines.append("")
    lines.append("These are derived layouts, not semantic authority.")
    lines.append("")
    lines.append("| relation | PostgreSQL-like candidate |")
    lines.append("|---|---|")
    for relation in relations:
        lines.append(f"| `{relation.stable_id}` | `{relation_physical_lowering(relation)}` |")
    lines.append("")

    lines.append("## Assertion-envelope examples")
    lines.append("")
    for stable_id in ["r:line-price", "r:order-customer", "r:availability"]:
        relation = next(r for r in relations if r.stable_id == stable_id)
        lines.append(f"- `{stable_id}` → `{relation_statement_shape(relation)}`")
    lines.append("")

    lines.append("## Important reading rule")
    lines.append("")
    lines.append("The fact that A can render `property`/`link` syntax does **not** prove unification. The executable hidden-branch audit is the stronger evidence: canonical generation must not dispatch on PropertyDef/LinkDef classes. Endpoint target kind, cardinality and identity semantics remain real distinctions.")
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    print(render())
