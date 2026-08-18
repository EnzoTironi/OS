from __future__ import annotations

import argparse
import sys
from typing import Any

from os_kernel.canonical import dumps_pretty
from os_kernel.errors import InputError, InternalError
from os_kernel.scenario import run_scenario, scenario_run_document

KNOWN_THEN_EXAMPLE = (
    "os query known-then --scenario v001 --subject stock:sku-x "
    "--predicate available-quantity --valid-at 2030-08-10 "
    "--known-at kr:before-late-document --output json"
)
NOW_BELIEVED_EXAMPLE = (
    "os query now-believed-for-then --scenario v001 --subject stock:sku-x "
    "--predicate available-quantity --valid-at 2030-08-10 --output json"
)
EXPLAIN_EXAMPLE = "os explain v001:operation:purchase-raw-1 --output json"
RUN_EXAMPLE = "os scenario run v001 --output json"


class _Help(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        invocation = self._invocation()
        raise InputError("invalid_usage", message, invocation)

    def _invocation(self) -> str:
        prog = self.prog
        if prog.endswith("scenario run"):
            return RUN_EXAMPLE
        if prog.endswith("explain"):
            return EXPLAIN_EXAMPLE
        if prog.endswith("query"):
            return KNOWN_THEN_EXAMPLE
        return "os --help"


def _parser() -> argparse.ArgumentParser:
    parser = _Help(
        prog="os",
        description="CLI não interativa do experimento kernel-v001. Executa o kernel público, sem prompt.",
    )
    parser.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")
    sub = parser.add_subparsers(dest="command")

    scenario = sub.add_parser(
        "scenario",
        help="Executa um cenário pelo kernel público.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Exemplos:\n  {RUN_EXAMPLE}\n",
    )
    scenario_sub = scenario.add_subparsers(dest="scenario_command")
    run = scenario_sub.add_parser(
        "run",
        help="Aplica cada comando do cenário via Kernel.apply e devolve ScenarioRun.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Exemplos:\n"
            f"  {RUN_EXAMPLE}\n"
            "  os scenario run v001 --engine ontology --output json\n"
        ),
    )
    run.add_argument("scenario_id", help="Identificador do cenário, por exemplo v001.")
    run.add_argument("--engine", default="ontology", help="Motor. ontology é o padrão. conventional não é suportado nesta unidade.")
    run.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")

    explain = sub.add_parser(
        "explain",
        help="Explica uma referência causal retida pelo kernel.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Exemplos:\n  {EXPLAIN_EXAMPLE}\n",
    )
    explain.add_argument("reference", help="Referência estável, por exemplo v001:operation:purchase-raw-1.")
    explain.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")

    query = sub.add_parser(
        "query",
        help="Consulta temporal known-then ou now-believed-for-then.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Exemplos:\n"
            f"  {KNOWN_THEN_EXAMPLE}\n"
            f"  {NOW_BELIEVED_EXAMPLE}\n"
        ),
    )
    query.add_argument("query_type", help="known-then ou now-believed-for-then.")
    query.add_argument("--scenario", required=True, help="Identificador do cenário.")
    query.add_argument("--subject", required=True, help="Sujeito da proposição.")
    query.add_argument("--predicate", required=True, help="Predicado da proposição.")
    query.add_argument("--valid-at", required=True, dest="valid_at", help="Tempo válido da pergunta.")
    query.add_argument("--known-at", dest="known_at", help="Corte de conhecimento. Obrigatório em known-then.")
    query.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")
    return parser


def _require_json(args: argparse.Namespace) -> None:
    if getattr(args, "output", None) != "json":
        raise InputError("missing_output", "use --output json", RUN_EXAMPLE)


def _run(args: argparse.Namespace) -> dict[str, Any]:
    _require_json(args)
    engine = args.engine or "ontology"
    if engine == "conventional":
        raise InputError(
            "unsupported_engine",
            "o motor conventional não é suportado nesta unidade",
            "os scenario run v001 --engine ontology --output json",
        )
    if engine != "ontology":
        raise InputError(
            "unsupported_engine",
            f"motor {engine!r} não é suportado",
            "os scenario run v001 --engine ontology --output json",
        )
    return scenario_run_document(args.scenario_id, engine)


def _explain(args: argparse.Namespace) -> dict[str, Any]:
    _require_json(args)
    reference = args.reference
    scenario_id = "v001"
    if ":" in reference:
        scenario_id = reference.split(":", 1)[0]
    kernel, _, _ = run_scenario(scenario_id)
    return kernel.explain(reference)


def _query(args: argparse.Namespace) -> dict[str, Any]:
    _require_json(args)
    if args.query_type == "known-then" and not args.known_at:
        raise InputError("missing_known_at", "known-then exige --known-at", KNOWN_THEN_EXAMPLE)
    if args.query_type == "now-believed-for-then" and args.known_at:
        raise InputError(
            "ambiguous_as_of",
            "now-believed-for-then não aceita --known-at. Isso evitaria um as-of ambíguo.",
            NOW_BELIEVED_EXAMPLE,
        )
    if args.query_type not in {"known-then", "now-believed-for-then"}:
        raise InputError("unknown_query", f"consulta {args.query_type!r} não é suportada", KNOWN_THEN_EXAMPLE)
    kernel, _, _ = run_scenario(args.scenario)
    payload = {
        "type": args.query_type,
        "subject": args.subject,
        "predicate": args.predicate,
        "valid_at": args.valid_at,
    }
    if args.known_at:
        payload["known_at"] = args.known_at
    return kernel.query(payload)


def _emit_error(exc: InputError | InternalError) -> int:
    payload: dict[str, Any] = {
        "ok": False,
        "error": {
            "code": exc.code,
            "message": exc.message,
            "class": "user-input" if isinstance(exc, InputError) else "internal",
        },
    }
    if isinstance(exc, InputError):
        payload["error"]["invocation"] = exc.invocation
    sys.stderr.write(dumps_pretty(payload))
    return exc.exit_code


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    try:
        args = parser.parse_args(argv)
        if args.command is None:
            parser.print_help()
            return 0
        if args.command == "scenario":
            if getattr(args, "scenario_command", None) != "run":
                scenario_parser = parser._subparsers._group_actions[0].choices["scenario"]
                scenario_parser.print_help()
                return 0
            document = _run(args)
        elif args.command == "explain":
            document = _explain(args)
        elif args.command == "query":
            document = _query(args)
        else:
            raise InputError("invalid_usage", "comando desconhecido", "os --help")
        sys.stdout.write(dumps_pretty(document))
        return 0
    except SystemExit as exc:
        return int(exc.code or 0)
    except InputError as exc:
        return _emit_error(exc)
    except InternalError as exc:
        return _emit_error(exc)
    except Exception as exc:
        return _emit_error(InternalError("internal", f"invariante quebrada: {exc}"))


def help_text() -> str:
    return _parser().format_help()
