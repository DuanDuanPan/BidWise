import argparse
import asyncio
import socket
import sys
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from docx_renderer.models.schemas import ErrorDetail, ErrorResponse
from docx_renderer.routes.health import router as health_router
from docx_renderer.routes.render import router as render_router
from docx_renderer.routes.shutdown import router as shutdown_router


def create_app() -> FastAPI:
    app = FastAPI(title="BidWise Docx Renderer")

    app.include_router(health_router, prefix="/api")
    app.include_router(render_router, prefix="/api")
    app.include_router(shutdown_router, prefix="/api")

    app.state.start_time = time.time()

    @app.exception_handler(Exception)
    async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        resp = ErrorResponse(
            error=ErrorDetail(code="UNKNOWN", message=str(exc))
        )
        return JSONResponse(
            status_code=500,
            content=resp.model_dump(by_alias=True),
        )

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()

    host: str = "127.0.0.1"  # Force localhost regardless of --host arg
    requested_port: int = args.port

    app = create_app()

    # Pre-bind socket to get actual port before starting uvicorn
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, requested_port))
    actual_port = sock.getsockname()[1]

    # READY signal for the parent process
    print(f"READY:{actual_port}", flush=True)

    config = uvicorn.Config(
        app,
        host=host,
        port=actual_port,
        log_level="warning",
    )
    server = uvicorn.Server(config)

    # Store shutdown callback in app state for the shutdown route
    async def trigger_shutdown() -> None:
        await asyncio.sleep(0.1)  # Let the response be sent first
        server.should_exit = True

    app.state.shutdown_callback = trigger_shutdown

    server.run(sockets=[sock])

    sys.exit(0)


if __name__ == "__main__":
    main()
