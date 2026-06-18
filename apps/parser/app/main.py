import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from .config import settings
from .parser import convert_to_markdown, get_converter, _resolve_ocr
from .schemas import HealthResponse, ParseResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("qi.parser")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Aquece o conversor (baixa modelos do Docling) antes de aceitar tráfego.
    await run_in_threadpool(get_converter)
    logger.info("Parser service pronto")
    yield


app = FastAPI(
    title="Qi Conhecimento — Parser Service",
    description="Conversão de documentos técnicos (PDF, imagem) para Markdown via Docling.",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/v1/parse", response_model=ParseResponse)
async def parse(
    file: UploadFile = File(...),
    do_ocr: str | None = Form(default=None),
) -> ParseResponse:
    data = await file.read()

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Arquivo excede {settings.max_upload_mb} MB")
    if not data:
        raise HTTPException(status_code=422, detail="Arquivo vazio")

    ocr_override: bool | None = None
    if do_ocr is not None:
        ocr_override = do_ocr.strip().lower() in ("true", "1", "yes", "on")

    try:
        markdown, title = await run_in_threadpool(
            convert_to_markdown,
            data,
            file.filename or "document.pdf",
            ocr_override,
        )
    except Exception as exc:  # noqa: BLE001 — superfície de erro controlada para o cliente
        logger.exception("Falha ao converter documento")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not markdown.strip():
        raise HTTPException(status_code=422, detail="Documento sem conteúdo extraível")

    ocr_used = _resolve_ocr(ocr_override)
    return ParseResponse(
        markdown=markdown,
        title=title,
        engine="docling+ocr" if ocr_used else "docling",
    )
