from __future__ import annotations


class InputError(Exception):
    def __init__(self, code: str, message: str, invocation: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.invocation = invocation
        self.exit_code = 2


class InternalError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = 1
