
from fastapi.responses import JSONResponse


class AppError(Exception):

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400
    ):
        super().__init__(message)

        self.code = code
        self.message = message
        self.status_code = status_code


def http_error(exc: AppError) -> JSONResponse:

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": exc.code,
            "message": exc.message
        }
    )
