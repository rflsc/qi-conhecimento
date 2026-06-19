"""Enriquece markdown do Docling com dados tabulares da camada de texto do PDF.

Normas técnicas (ex.: NBR 8800) costumam ter tabelas ilustradas que o Docling
exporta como `<!-- image -->`, perdendo linhas numéricas ainda presentes no PDF.
"""

from __future__ import annotations

import logging
import re

import pypdfium2 as pdfium

logger = logging.getLogger("qi.parser")

IMAGE_PLACEHOLDER = "<!-- image -->"
TABLE_CAPTION_RE = re.compile(
    r"^(Tabela\s+[A-Z]?\d*(?:\.\d+)?\s*[-–—].*)$",
    re.MULTILINE | re.IGNORECASE,
)
TABLE_ID_RE = re.compile(r"Tabela\s+([A-Z]?\d*(?:\.\d+)?)", re.IGNORECASE)
DECIMAL_VALUES_RE = re.compile(r"\d,\d+")
# Linha "termina" a região de uma tabela: próxima tabela, anexo ou item numerado.
TABLE_STOP_RE = re.compile(
    r"^\s*(Tabela\s+|Anexo\s+|Figura\s+|[A-Z]\.\d+(?:\.\d+)*\s)",
    re.IGNORECASE,
)


def enrich_table_images(
    pdf_path: str,
    markdown: str,
    page_range: tuple[int, int] | None = None,
) -> tuple[str, list[dict]]:
    from .config import settings

    if not settings.table_image_recovery or IMAGE_PLACEHOLDER not in markdown:
        return markdown, []

    page_texts = _extract_page_texts(pdf_path, page_range)
    recovered_count = 0
    recovered_blocks: list[dict] = []

    # Itera de trás p/ frente para que os offsets não invalidem com a substituição.
    matches = list(TABLE_CAPTION_RE.finditer(markdown))
    result = markdown
    for caption_match in reversed(matches):
        caption = caption_match.group(1)
        table_id_match = TABLE_ID_RE.search(caption)
        if not table_id_match:
            continue

        table_id = table_id_match.group(1)
        after_caption = result[caption_match.end() : caption_match.end() + 800]
        img_offset = after_caption.find(IMAGE_PLACEHOLDER)
        if img_offset < 0:
            continue

        table_md, page_no = _build_table_markdown(table_id, caption, page_texts)
        if not table_md:
            continue

        abs_start = caption_match.end() + img_offset
        abs_end = abs_start + len(IMAGE_PLACEHOLDER)
        result = result[:abs_start] + table_md + result[abs_end:]
        recovered_count += 1
        recovered_blocks.append(
            {
                "type": "table",
                "caption": caption.strip(),
                "markdown": table_md.strip(),
                "pageStart": page_no,
                "pageEnd": page_no,
                "headingPath": [],
                "tableSource": "text_recovery",
            }
        )

    if recovered_count:
        logger.info("Recuperadas %s tabela(s) da camada de texto do PDF", recovered_count)

    return result, recovered_blocks


def _extract_page_texts(
    pdf_path: str,
    page_range: tuple[int, int] | None,
) -> dict[int, str]:
    doc = pdfium.PdfDocument(pdf_path)
    try:
        if page_range is not None:
            start, end = page_range
            indices = range(max(0, start - 1), min(end, len(doc)))
        else:
            indices = range(len(doc))
        return {
            index + 1: (doc[index].get_textpage().get_text_range() or "")
            for index in indices
        }
    finally:
        doc.close()


def _build_table_markdown(
    table_id: str,
    caption: str,
    page_texts: dict[int, str],
) -> tuple[str | None, int | None]:
    needle = f"Tabela {table_id}".strip().lower()
    for page_no, text in page_texts.items():
        if needle not in text.lower():
            continue

        # 1) Parser especializado (melhor qualidade) p/ tabela de K horizontal.
        horizontal = _parse_horizontal_k_table(text)
        if horizontal:
            return horizontal, page_no

        # 2) Fallback genérico: recupera a região da tabela da camada de texto.
        recovered = _recover_table_region(caption, text)
        if recovered:
            return recovered, page_no

    return None, None


def _recover_table_region(caption: str, page_text: str) -> str | None:
    """Captura as linhas da tabela no texto do PDF e devolve um bloco legível.

    Usado quando o Docling exporta a tabela como imagem mas o PDF ainda tem a
    camada de texto. Não reconstrói colunas, mas garante que os valores
    numéricos entrem no chunk (busca + LLM).
    """
    lines = page_text.splitlines()
    caption_norm = re.sub(r"\s+", " ", caption).strip().lower()

    start_idx = None
    for i, line in enumerate(lines):
        normalized = re.sub(r"\s+", " ", line).strip().lower()
        if normalized.startswith("tabela") and caption_norm[:25] in normalized:
            start_idx = i + 1
            break
    if start_idx is None:
        return None

    region: list[str] = []
    for line in lines[start_idx:]:
        stripped = line.strip()
        if not stripped:
            if region:  # tolera 1 linha em branco no meio; corta se já tem conteúdo
                continue
            continue
        if TABLE_STOP_RE.match(stripped):
            break
        region.append(stripped)
        if len(region) >= 60:  # guarda contra runaway
            break

    # Só vale a pena se houver números (tabela técnica costuma ter valores).
    has_numbers = any(re.search(r"\d", line) for line in region)
    if len(region) < 2 or not has_numbers:
        return None

    body = "\n".join(region)
    return (
        "\n```\n"
        f"{body}\n"
        "```\n\n"
        "> Conteúdo da tabela recuperado da camada de texto do PDF "
        "(o Docling exportou o original como imagem)."
    )


def _parse_horizontal_k_table(page_text: str) -> str | None:
    """Tabela H.1: casos (a)–(f) em colunas, linhas teórico/recomendado."""
    if "Valores teóricos de K" not in page_text or "Valores recomendados" not in page_text:
        return None

    teorico_match = re.search(
        r"Valores teóricos de K\s+([\d,\s]+)",
        page_text,
        re.IGNORECASE,
    )
    recom_match = re.search(
        r"Valores recomendados\s+([\d,\s]+)",
        page_text,
        re.IGNORECASE,
    )
    if not teorico_match or not recom_match:
        return None

    teorico_vals = DECIMAL_VALUES_RE.findall(teorico_match.group(1))
    recom_vals = DECIMAL_VALUES_RE.findall(recom_match.group(1))
    if len(teorico_vals) < 4 or len(recom_vals) < 4:
        return None

    cases = [f"({letter})" for letter in "abcdef"]
    conditions = _extract_support_conditions(page_text)

    rows: list[str] = []
    for index, case in enumerate(cases):
        condition = conditions[index] if index < len(conditions) else "—"
        teorico = teorico_vals[index] if index < len(teorico_vals) else "—"
        recom = recom_vals[index] if index < len(recom_vals) else "—"
        rows.append(f"| {case} | {condition} | {teorico} | {recom} |")

    header = (
        "| Caso | Condição de apoio | K teórico | K recomendado |\n"
        "| --- | --- | --- | --- |"
    )
    note = (
        "\n\n> Tabela reconstruída a partir da camada de texto do PDF "
        "(diagrama original substituído por `<!-- image -->` no Docling)."
    )
    return f"{header}\n" + "\n".join(rows) + note


def _extract_support_conditions(page_text: str) -> list[str]:
    if "Código para condição" not in page_text:
        return []

    section = page_text.split("Código para condição", maxsplit=1)[1]
    conditions: list[str] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("Tabela "):
            break
        if "Rotação" in stripped or "translação" in stripped.lower():
            conditions.append(stripped)

    return conditions
