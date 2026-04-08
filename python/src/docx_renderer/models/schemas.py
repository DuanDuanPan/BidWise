from typing import Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class ErrorDetail(CamelModel):
    code: str
    message: str


class SuccessResponse(CamelModel, Generic[T]):
    success: Literal[True] = True
    data: T


class ErrorResponse(CamelModel):
    success: Literal[False] = False
    error: ErrorDetail


class RenderRequest(CamelModel):
    markdown_content: str
    output_path: str
    template_path: Optional[str] = None
    project_id: str


class RenderResult(CamelModel):
    output_path: str
    page_count: Optional[int] = None
    render_time_ms: float


class HealthData(CamelModel):
    status: str
    version: str
    uptime_seconds: float


class ShutdownData(CamelModel):
    accepted: bool
