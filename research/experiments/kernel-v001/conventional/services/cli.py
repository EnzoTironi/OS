from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
from typing import Any

from services.canonical import dumps_pretty
from services.engine import engine_for_named_scenario, run_named_scenario
from services.errors import InputError, InternalError

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

_HEADING = {
    "positional arguments": "argumentos posicionais",
    "optional arguments": "argumentos opcionais",
    "options": "opções",
}


class PtFormatter(argparse.RawDescriptionHelpFormatter):
    def add_usage(self, usage, actions, groups, prefix=None):
        label = "uso: " if prefix is None else prefix
        return super().add_usage(usage, actions, groups, label)

    def start_section(self, heading):
        super().start_section(_HEADING.get(heading, heading))


def _label(parser: argparse.ArgumentParser) -> argparse.ArgumentParser:
    if parser._positionals is not None:
        parser._positionals.title = "argumentos posicionais"
    if parser._optionals is not None:
        parser._optionals.title = "opções"
    return parser


def _example_for(prog: str) -> str:
    pairs = (
        ("scenario run", RUN_EXAMPLE),
        ("explain", EXPLAIN_EXAMPLE),
        ("query", KNOWN_THEN_EXAMPLE),
    )
    for suffix, example in pairs:
        if prog.endswith(suffix):
            return example
    return "os --help"


class OsParser(argparse.ArgumentParser):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("formatter_class", PtFormatter)
        super().__init__(*args, **kwargs)
        _label(self)

    def error(self, message: str) -> None:
        raise InputError("invalid_usage", message, _example_for(self.prog))


def _parser() -> argparse.ArgumentParser:
    parser = OsParser(
        prog="os",
        description="CLI convencional do baseline kernel-v001. Sem prompt e sem motor ontológico.",
    )
    parser.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")
    sub = parser.add_subparsers(dest="command")

    scenario = _label(
        sub.add_parser(
            "scenario",
            help="Executa um cenário pelos serviços de domínio.",
            formatter_class=PtFormatter,
            epilog=f"Exemplos:\n  {RUN_EXAMPLE}\n",
        )
    )
    scenario_sub = scenario.add_subparsers(dest="scenario_command")
    run = _label(
        scenario_sub.add_parser(
            "run",
            help="Aplica cada comando do cenário e devolve ScenarioRun.",
            formatter_class=PtFormatter,
            epilog=f"Exemplos:\n  {RUN_EXAMPLE}\n",
        )
    )
    run.add_argument("scenario_id", help="Identificador do cenário, por exemplo v001.")
    run.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")

    explain = _label(
        sub.add_parser(
            "explain",
            help="Explica uma operação retida pelos serviços convencionais.",
            formatter_class=PtFormatter,
            epilog=f"Exemplos:\n  {EXPLAIN_EXAMPLE}\n",
        )
    )
    explain.add_argument("reference", help="Referência estável, por exemplo v001:operation:purchase-raw-1.")
    explain.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")

    query = _label(
        sub.add_parser(
            "query",
            help="Consulta temporal known-then ou now-believed-for-then.",
            formatter_class=PtFormatter,
            epilog=f"Exemplos:\n  {KNOWN_THEN_EXAMPLE}\n  {NOW_BELIEVED_EXAMPLE}\n",
        )
    )
    query.add_argument("query_type", help="known-then ou now-believed-for-then.")
    query.add_argument("--scenario", required=True, help="Identificador do cenário.")
    query.add_argument("--subject", required=True, help="Sujeito da proposição.")
    query.add_argument("--predicate", required=True, help="Predicado da proposição.")
    query.add_argument("--valid-at", required=True, dest="valid_at", help="Tempo válido da pergunta.")
    query.add_argument("--known-at", dest="known_at", help="Corte de conhecimento. Obrigatório em known-then.")
    query.add_argument("--output", choices=("json",), help="Formato de saída. Apenas json.")
    return parser


def insist_json(args: argparse.Namespace) -> None:
    if getattr(args, "output", None) != "json":
        raise InputError("missing_output", "use --output json", RUN_EXAMPLE)


def run_command(args: argparse.Namespace) -> dict[str, Any]:
    insist_json(args)
    return run_named_scenario(args.scenario_id)


def explain_command(args: argparse.Namespace) -> dict[str, Any]:
    insist_json(args)
    reference = args.reference
    scenario_id = reference.split(":", 1)[0] if ":" in reference else "v001"
    return engine_for_named_scenario(scenario_id).explain(reference)


def query_command(args: argparse.Namespace) -> dict[str, Any]:
    insist_json(args)
    kind = args.query_type
    if kind == "known-then" and not args.known_at:
        raise InputError("missing_known_at", "known-then exige --known-at", KNOWN_THEN_EXAMPLE)
    if kind == "now-believed-for-then" and args.known_at:
        raise InputError("ambiguous_as_of", "now-believed-for-then não aceita --known-at", NOW_BELIEVED_EXAMPLE)
    if kind not in {"known-then", "now-believed-for-then"}:
        raise InputError("unknown_query", f"consulta {kind!r} não é suportada", KNOWN_THEN_EXAMPLE)
    payload = {
        "type": kind,
        "subject": args.subject,
        "predicate": args.predicate,
        "valid_at": args.valid_at,
    }
    if args.known_at:
        payload["known_at"] = args.known_at
    return engine_for_named_scenario(args.scenario).query(payload)


def write_error(exc: InputError | InternalError) -> int:
    kind = "user-input" if isinstance(exc, InputError) else "internal"
    error: dict[str, Any] = {"code": exc.code, "message": exc.message, "class": kind}
    if isinstance(exc, InputError):
        error["invocation"] = exc.invocation
    sys.stderr.write(dumps_pretty({"ok": False, "error": error}))
    return exc.exit_code


def _scenario_document(parser: argparse.ArgumentParser, args: argparse.Namespace) -> dict[str, Any] | None:
    if getattr(args, "scenario_command", None) != "run":
        parser._subparsers._group_actions[0].choices["scenario"].print_help()
        return None
    return run_command(args)


HANDLERS: dict[str, Callable[[argparse.ArgumentParser, argparse.Namespace], dict[str, Any] | None]] = {
    "scenario": _scenario_document,
    "explain": lambda _parser, args: explain_command(args),
    "query": lambda _parser, args: query_command(args),
}


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    try:
        args = parser.parse_args(argv)
        handler = HANDLERS.get(args.command) if args.command else None
        if handler is None:
            parser.print_help()
            return 0
        document = handler(parser, args)
        if document is None:
            return 0
        sys.stdout.write(dumps_pretty(document))
        return 0
    except SystemExit as exc:
        return int(exc.code or 0)
    except InputError as exc:
        return write_error(exc)
    except InternalError as exc:
        return write_error(exc)
    except Exception as exc:
        return write_error(InternalError("internal", f"invariante quebrada: {exc}"))
