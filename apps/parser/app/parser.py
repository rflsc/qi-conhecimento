import logging
import os
import tempfile
from functools import lru_cache

from docling.document_converter import DocumentConverter

from .config import settings

logger = logging.getLogger("qi.parser")


@lru_cache(maxsize=1)
def get_converter() -> DocumentConverter:
    """Instancia o DocumentConverter uma única vez (carga de modelos é cara)."""
    logger.info("Inicializando DocumentConverter (Docling)... ocr=%s", settings.do_ocr)
    return DocumentConverter()


def convert_to_markdown(file_bytes: bytes, filename: str) -> tuple[str, str | None]:
    """Converte um documento (PDF, imagem, etc.) para Markdown estruturado.

    Retorna (markdown, title). O título é extraído do primeiro heading H1.
    """
    suffix = os.path.splitext(filename)[1] or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        result = get_converter().convert(tmp_path)
        markdown = result.document.export_to_markdown()
        return markdown, _extract_title(markdown)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _extract_title(markdown: str) -> str | None:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return None
