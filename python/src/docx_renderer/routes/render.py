import logging

from fastapi import APIRouter

from docx_renderer.engine.renderer import RendererError, render_markdown_to_docx
from docx_renderer.models.schemas import ErrorDetail, ErrorResponse, RenderRequest, RenderResult, SuccessResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/render-documents")
async def render_documents(
    request: RenderRequest,
) -> SuccessResponse[RenderResult] | ErrorResponse:
    try:
        result = render_markdown_to_docx(
            markdown_content=request.markdown_content,
            output_path=request.output_path,
            template_path=request.template_path,
            style_mapping=request.style_mapping,
            page_setup=request.page_setup,
            project_path=request.project_path,
        )
        return SuccessResponse(data=result)
    except RendererError as e:
        return ErrorResponse(error=ErrorDetail(code=e.code, message=str(e)))
    except Exception as e:
        logger.exception("Unexpected error during render")
        return ErrorResponse(error=ErrorDetail(code="RENDER_UNEXPECTED", message=str(e)))
