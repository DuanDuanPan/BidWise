import asyncio

from fastapi import APIRouter, Request

from docx_renderer.models.schemas import ShutdownData, SuccessResponse

router = APIRouter()


@router.post("/shutdown")
async def shutdown(request: Request) -> SuccessResponse[ShutdownData]:
    shutdown_callback = getattr(request.app.state, "shutdown_callback", None)
    if shutdown_callback:
        asyncio.create_task(shutdown_callback())
    return SuccessResponse(data=ShutdownData(accepted=True))
