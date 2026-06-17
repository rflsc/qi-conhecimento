import logging
import os
import tempfile
from typing import Any

import pypdfium2 as pdfium
from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

from .config import settings

logger = logging.getLogger("qi.parser")


def get_converter() -> DocumentConverter:
    """Aquece modelos na subida do serviço."""
    return _build_converter()


def _build_converter() -> DocumentConverter:
    pipeline_options = PdfPipelineOptions(
        do_ocr=settings.do_ocr,
        generate_page_images=False,
        generate_picture_images=False,
        generate_parsed_pages=False,
        ocr_batch_size=1,
        layout_batch_size=1,
        table_batch_size=1,
    )

    pdf_format = PdfFormatOption(pipeline_options=pipeline_options)
    if settings.low_memory:
        pdf_format = PdfFormatOption(
            pipeline_options=pipeline_options,
            backend=PyPdfiumDocumentBackend,
        )

    logger.info(
        "DocumentConverter ocr=%s low_memory=%s batch=%s",
        settings.do_ocr,
        settings.low_memory,
        settings.page_batch_size,
    )
    return DocumentConverter(
        format_options={InputFormat.PDF: pdf_format},
    )


def convert_to_markdown(file_bytes: bytes, filename: str) -> tuple[str, str | None]:
    suffix = os.path.splitext(filename)[1] or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if suffix.lower() != ".pdf":
            return _convert_path(tmp_path)

        page_count = _pdf_page_count(tmp_path)
        batch = settings.page_batch_size
        if batch <= 0 or page_count <= batch:
            return _convert_path(tmp_path)

        logger.info("Convertendo PDF em lotes: %s páginas, batch=%s", page_count, batch)
        parts: list[str] = []
        for start in range(1, page_count + 1, batch):
            end = min(start + batch - 1, page_count)
            converter = _build_converter()
            try:
                markdown, _ = _convert_path(tmp_path, converter, page_range=(start, end))
                if markdown.strip():
                    parts.append(markdown.strip())
            finally:
                del converter

        full = "\n\n".join(parts)
        return full, _extract_title(full)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _pdf_page_count(path: str) -> int:
    doc = pdfium.PdfDocument(path)
    try:
        return len(doc)
    finally:
        doc.close()


def _convert_path(
    path: str,
    converter: DocumentConverter | None = None,
    page_range: tuple[int, int] | None = None,
) -> tuple[str, str | None]:
    owns_converter = converter is None
    active = converter or _build_converter()
    try:
        kwargs: dict[str, Any] = {}
        if page_range is not None:
            kwargs["page_range"] = page_range

        result = active.convert(path, **kwargs)
        try:
            markdown = result.document.export_to_markdown()
            return markdown, _extract_title(markdown)
        finally:
            _unload_result(result)
    finally:
        if owns_converter:
            del active


def _unload_result(result: Any) -> None:
    backend = getattr(getattr(result, "input", None), "_backend", None)
    if backend is not None and hasattr(backend, "unload"):
        try:
            backend.unload()
        except Exception:  # noqa: BLE001
            logger.debug("Falha ao descarregar backend Docling", exc_info=True)


def _extract_title(markdown: str) -> str | None:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return None
