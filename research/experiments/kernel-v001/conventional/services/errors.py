from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class _Fault:
    code: str
    text: str
    status: int
    hint: str | None = None


class InputError(Exception):
    def __init__(self, code: str, message: str, invocation: str) -> None:
        super().__init__(message)
        self._fault = _Fault(code, message, 2, invocation)

    @property
    def code(self) -> str:
        return self._fault.code

    @property
    def message(self) -> str:
        return self._fault.text

    @property
    def invocation(self) -> str:
        return self._fault.hint or ""

    @property
    def exit_code(self) -> int:
        return self._fault.status


class InternalError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self._fault = _Fault(code, message, 1)

    @property
    def code(self) -> str:
        return self._fault.code

    @property
    def message(self) -> str:
        return self._fault.text

    @property
    def exit_code(self) -> int:
        return self._fault.status
