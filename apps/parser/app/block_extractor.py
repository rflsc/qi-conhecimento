"""Extrai blocos estruturados (página, tipo, caption) do DoclingDocument."""

from __future__ import annotations

import logging
from typing import Any

from docling_core.types.doc import (
    DoclingDocument,
    ListItem,
    SectionHeaderItem,
    TableItem,
    TextItem,
    TitleItem,
)

logger = logging.getLogger("qi.parser")

ParseBlock = dict[str, Any]


def extract_blocks(document: DoclingDocument) -> list[ParseBlock]:
    """Itera o documento Docling e devolve blocos serializáveis para a API NestJS."""
    blocks: list[ParseBlock] = []
    heading_stack: list[tuple[int, str]] = []

    try:
        iterator = document._iterate_items_with_stack()
    except Exception:  # noqa: BLE001
        logger.debug("Falha ao iterar DoclingDocument", exc_info=True)
        return blocks

    for item, _stack in iterator:
        if isinstance(item, (SectionHeaderItem, TitleItem)):
            level = getattr(item, "level", None) or (1 if isinstance(item, TitleItem) else 2)
            text = (getattr(item, "text", None) or "").strip()
            if not text:
                continue

            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, text))

            page_start, page_end = _page_range(item)
            blocks.append(
                {
                    "type": "heading",
                    "text": text,
                    "level": level,
                    "pageStart": page_start,
                    "pageEnd": page_end,
                    "headingPath": [h[1] for h in heading_stack],
                }
            )
            continue

        if isinstance(item, TableItem):
            caption = _table_caption(item, document)
            try:
                markdown = (item.export_to_markdown() or "").strip()
            except Exception:  # noqa: BLE001
                markdown = ""

            if not markdown and not caption:
                continue

            page_start, page_end = _page_range(item)
            blocks.append(
                {
                    "type": "table",
                    "caption": caption or None,
                    "markdown": markdown or None,
                    "pageStart": page_start,
                    "pageEnd": page_end,
                    "headingPath": _heading_path(heading_stack),
                    "tableSource": "docling",
                }
            )
            continue

        if isinstance(item, (TextItem, ListItem)):
            text = (getattr(item, "text", None) or "").strip()
            if not text or text == "<!-- image -->":
                continue

            page_start, page_end = _page_range(item)
            blocks.append(
                {
                    "type": "list" if isinstance(item, ListItem) else "paragraph",
                    "text": text,
                    "pageStart": page_start,
                    "pageEnd": page_end,
                    "headingPath": _heading_path(heading_stack),
                }
            )

    return blocks


def merge_recovered_tables(
    blocks: list[ParseBlock],
    recovered: list[ParseBlock],
) -> list[ParseBlock]:
    """Incorpora tabelas recuperadas da camada de texto do PDF."""
    if not recovered:
        return blocks

    merged = list(blocks)
    for rec in recovered:
        caption = (rec.get("caption") or "").strip().lower()
        replaced = False

        if caption:
            for block in merged:
                if block.get("type") != "table":
                    continue
                existing = (block.get("caption") or "").strip().lower()
                if existing and (caption in existing or existing in caption):
                    block["markdown"] = rec.get("markdown") or block.get("markdown")
                    block["tableSource"] = "text_recovery"
                    block["pageStart"] = rec.get("pageStart") or block.get("pageStart")
                    block["pageEnd"] = rec.get("pageEnd") or block.get("pageEnd")
                    replaced = True
                    break

        if not replaced:
            merged.append(rec)

    return merged


def _heading_path(heading_stack: list[tuple[int, str]]) -> list[str]:
    return [text for _, text in heading_stack]


def _page_range(item: Any) -> tuple[int | None, int | None]:
    prov = getattr(item, "prov", None) or []
    pages = [p.page_no for p in prov if getattr(p, "page_no", None)]
    if not pages:
        return None, None
    return min(pages), max(pages)


def _table_caption(item: TableItem, document: DoclingDocument) -> str:
    try:
        return (item.caption_text(document) or "").strip()
    except Exception:  # noqa: BLE001
        return ""
