import os
from typing import Any

_VALID_PROFILES = frozenset({"default", "low_memory", "high_memory"})

# Presets — valores usados quando a variável específica não está no ambiente.
_PROFILE_PRESETS: dict[str, dict[str, Any]] = {
    "default": {
        "page_batch_size": 8,
        "parallel_workers": 0,  # auto → 1 com tabelas / PDF >30 págs
        "parallel_auto_max": 1,
        "parallel_page_limit": 30,
        "batch_cap_over_150": 4,
        "batch_cap_over_60": 6,
        "batch_cap_over_30": 8,
    },
    "low_memory": {
        "page_batch_size": 4,
        "parallel_workers": 1,
        "parallel_auto_max": 1,
        "parallel_page_limit": 0,
        "batch_cap_over_150": 3,
        "batch_cap_over_60": 4,
        "batch_cap_over_30": 4,
    },
    "high_memory": {
        "page_batch_size": 12,
        "parallel_workers": 2,
        "parallel_auto_max": 2,
        "parallel_page_limit": 400,
        "batch_cap_over_150": 4,
        "batch_cap_over_60": 4,
        "batch_cap_over_30": 6,
    },
}


def _active_profile() -> str:
    raw = os.getenv("PARSER_PROFILE", "default").strip().lower()
    return raw if raw in _VALID_PROFILES else "default"


def _preset(key: str) -> Any:
    profile = _active_profile()
    return _PROFILE_PRESETS[profile].get(key, _PROFILE_PRESETS["default"][key])


def _env_int(name: str, preset_key: str) -> int:
    raw = os.getenv(name)
    if raw is not None and raw.strip() != "":
        return int(raw)
    return int(_preset(preset_key))


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is not None and raw.strip() != "":
        return float(raw)
    return default


class Settings:
    """Configuração lida de variáveis de ambiente (sem dependência extra)."""

    host: str = os.getenv("PARSER_HOST", "0.0.0.0")
    port: int = int(os.getenv("PARSER_PORT", "8000"))
    max_upload_mb: int = int(os.getenv("PARSER_MAX_UPLOAD_MB", "150"))

    profile: str = _active_profile()

    # OCR de PDFs escaneados (mais lento e consume mais RAM)
    do_ocr: bool = os.getenv("PARSER_DO_OCR", "false").lower() == "true"

    # Backend pypdfium2 — mais leve; recomendado em máquinas com <16 GB RAM
    low_memory: bool = os.getenv("PARSER_LOW_MEMORY", "true").lower() == "true"

    page_batch_size: int = _env_int("PARSER_PAGE_BATCH_SIZE", "page_batch_size")

    # 0 = auto conforme perfil; >=1 = valor fixo
    parallel_workers: int = _env_int("PARSER_PARALLEL_WORKERS", "parallel_workers")

    images_scale: float = _env_float("PARSER_IMAGES_SCALE", 1.0)

    threads_per_worker: int = int(os.getenv("PARSER_THREADS_PER_WORKER", "0"))

    do_table_structure: bool = os.getenv("PARSER_DO_TABLE_STRUCTURE", "true").lower() == "true"

    table_mode: str = os.getenv("PARSER_TABLE_MODE", "accurate").lower()

    table_cell_matching: bool = os.getenv("PARSER_TABLE_CELL_MATCHING", "true").lower() == "true"

    table_image_recovery: bool = os.getenv("PARSER_TABLE_IMAGE_RECOVERY", "true").lower() == "true"


settings = Settings()


def parallel_page_limit() -> int:
    """Acima deste nº de páginas, força workers=1 (exceto se perfil high_memory elevar o limite)."""
    return int(_preset("parallel_page_limit"))


def resolve_parallel_workers(page_count: int = 0) -> int:
    """Workers efetivos — perfil high_memory permite 2 workers até parallel_page_limit."""
    configured = settings.parallel_workers
    limit = parallel_page_limit()
    auto_max = int(_preset("parallel_auto_max"))

    if configured >= 1:
        workers = configured
    elif page_count > limit > 0:
        workers = 1
    elif settings.do_table_structure or page_count > 30:
        workers = min(auto_max, 2)
    elif settings.low_memory:
        workers = 1
    else:
        cpu = os.cpu_count() or 2
        workers = max(1, min(auto_max, cpu // 2))

    if limit > 0 and page_count > limit and workers > 1:
        return 1

    return workers


def effective_page_batch_size(page_count: int) -> int:
    """Reduz lotes em PDFs longos — limites dependem do perfil."""
    batch = max(1, settings.page_batch_size)
    cap_150 = int(_preset("batch_cap_over_150"))
    cap_60 = int(_preset("batch_cap_over_60"))
    cap_30 = int(_preset("batch_cap_over_30"))

    if page_count > 150:
        return min(batch, cap_150)
    if page_count > 60:
        return min(batch, cap_60)
    if page_count > 30:
        return min(batch, cap_30)
    return batch


def resolve_threads_per_worker(workers: int) -> int:
    configured = settings.threads_per_worker
    if configured >= 1:
        return configured
    cpu = os.cpu_count() or 2
    if workers > 1:
        # Vários processos já carregam modelos Docling — auto conservador (evita 6+ threads/worker).
        return max(1, min(2, cpu // max(1, workers)))
    return max(1, min(4, cpu // 2))
