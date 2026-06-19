"""Estado de progresso de jobs de parse (em memória, por instância do serviço)."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import Lock

_lock = Lock()
_jobs: dict[str, ParseJobProgress] = {}


@dataclass
class ParseJobProgress:
    job_id: str
    status: str = "pending"
    pages_total: int = 0
    pages_done: int = 0
    batch_index: int = 0
    batch_count: int = 0
    batch_start_page: int = 0
    batch_end_page: int = 0
    message: str = ""
    updated_at: float = field(default_factory=time.time)


def init_job(job_id: str, pages_total: int = 0, message: str = "") -> None:
    with _lock:
        _jobs[job_id] = ParseJobProgress(
            job_id=job_id,
            status="running",
            pages_total=pages_total,
            message=message or (f"Preparando parse de {pages_total} página(s)…" if pages_total else "Preparando parse…"),
        )


def update_job(job_id: str, **fields: object) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        for key, value in fields.items():
            if hasattr(job, key):
                setattr(job, key, value)
        job.updated_at = time.time()


def complete_job(job_id: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "completed"
        if job.pages_total > 0:
            job.pages_done = job.pages_total
        job.updated_at = time.time()


def fail_job(job_id: str, message: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            _jobs[job_id] = ParseJobProgress(job_id=job_id, status="failed", message=message)
            return
        job.status = "failed"
        job.message = message
        job.updated_at = time.time()


def get_job(job_id: str) -> ParseJobProgress | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        return ParseJobProgress(**job.__dict__)


def drop_job(job_id: str) -> None:
    with _lock:
        _jobs.pop(job_id, None)
