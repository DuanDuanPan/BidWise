import time

from fastapi import APIRouter, Request

from docx_renderer import __version__
from docx_renderer.models.schemas import HealthData, SuccessResponse

router = APIRouter()


@router.get("/health")
async def health(request: Request) -> SuccessResponse[HealthData]:
    start_time: float = request.app.state.start_time
    uptime = time.time() - start_time
    return SuccessResponse(
        data=HealthData(
            status="healthy",
            version=__version__,
            uptime_seconds=round(uptime, 2),
        )
    )
