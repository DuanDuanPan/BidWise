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


class StyleMapping(CamelModel):
    heading1: Optional[str] = None
    heading2: Optional[str] = None
    heading3: Optional[str] = None
    heading4: Optional[str] = None
    heading5: Optional[str] = None
    heading6: Optional[str] = None
    body_text: Optional[str] = None
    table: Optional[str] = None
    list_bullet: Optional[str] = None
    list_number: Optional[str] = None
    caption: Optional[str] = None
    code_block: Optional[str] = None
    toc: Optional[str] = None


class PageSetup(CamelModel):
    content_width_mm: Optional[float] = None


class RenderRequest(CamelModel):
    markdown_content: str
    output_path: str
    template_path: Optional[str] = None
    project_id: str
    style_mapping: Optional[StyleMapping] = None
    page_setup: Optional[PageSetup] = None
    project_path: Optional[str] = None


class RenderResult(CamelModel):
    output_path: str
    page_count: Optional[int] = None
    render_time_ms: float
    warnings: list[str] = Field(default_factory=list)


class HealthData(CamelModel):
    status: str
    version: str
    uptime_seconds: float


class ShutdownData(CamelModel):
    accepted: bool
