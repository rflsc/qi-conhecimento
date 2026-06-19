"""Conversão de lotes de páginas em paralelo (multiprocessing)."""

from __future__ import annotations

import logging
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import Any

from .progress import update_job

logger = logging.getLogger("qi.parser")

Batch = tuple[int, int, int]
ParseBlock = dict[str, Any]

_WORKER_CONVERTER = None
_WORKER_DO_OCR: bool | None = None


def _init_worker(do_ocr: bool | None, threads: int) -> None:
    global _WORKER_DO_OCR
    _WORKER_DO_OCR = do_ocr
    try:
        import torch

        torch.set_num_threads(max(1, threads))
    except Exception:  # noqa: BLE001
        pass


def _worker_convert(tmp_path: str, batch: Batch) -> tuple[int, str, list[ParseBlock]]:
    global _WORKER_CONVERTER

    from .parser import _build_converter, convert_batch

    if _WORKER_CONVERTER is None:
        _WORKER_CONVERTER = _build_converter(_WORKER_DO_OCR)

    index, start, end = batch
    markdown, blocks = convert_batch(tmp_path, (start, end), _WORKER_DO_OCR, _WORKER_CONVERTER)
    return index, markdown, blocks


def convert_batches_parallel(
    tmp_path: str,
    batches: list[Batch],
    page_count: int,
    do_ocr: bool | None,
    job_id: str | None,
    workers: int,
    threads_per_worker: int,
) -> tuple[list[str], list[ParseBlock]]:
    batch_count = len(batches)
    markdown_results: dict[int, str] = {}
    block_results: dict[int, list[ParseBlock]] = {}
    pages_done = 0

    logger.info(
        "Pool paralelo: %s workers, %s threads/worker, %s lotes",
        workers,
        threads_per_worker,
        batch_count,
    )

    t0 = time.monotonic()
    with ProcessPoolExecutor(
        max_workers=workers,
        initializer=_init_worker,
        initargs=(do_ocr, threads_per_worker),
    ) as executor:
        future_to_batch = {
            executor.submit(_worker_convert, tmp_path, batch): batch for batch in batches
        }

        completed = 0
        for future in as_completed(future_to_batch):
            index, start, end = future_to_batch[future]
            try:
                _, markdown, blocks = future.result()
            except Exception:
                logger.exception("Lote %s (págs. %s–%s) falhou no worker", index, start, end)
                raise

            markdown_results[index] = markdown
            block_results[index] = blocks
            completed += 1
            pages_done += end - start + 1
            logger.info(
                "Lote %s/%s pronto (págs. %s–%s) — %s/%s páginas",
                index,
                batch_count,
                start,
                end,
                pages_done,
                page_count,
            )
            if job_id:
                update_job(
                    job_id,
                    batch_index=completed,
                    pages_done=pages_done,
                    message=(
                        f"{completed}/{batch_count} lotes concluídos — "
                        f"{pages_done}/{page_count} páginas ({workers} em paralelo)"
                    ),
                )

    elapsed = time.monotonic() - t0
    logger.info(
        "Pool paralelo concluído: %s páginas em %.1fs (%.2fs/página)",
        page_count,
        elapsed,
        elapsed / max(1, page_count),
    )

    parts: list[str] = []
    all_blocks: list[ParseBlock] = []
    for index, _, _ in batches:
        markdown = markdown_results.get(index, "")
        if markdown.strip():
            parts.append(markdown.strip())
        all_blocks.extend(block_results.get(index, []))

    return parts, all_blocks
