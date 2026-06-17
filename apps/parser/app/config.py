import os


class Settings:
    """Configuração lida de variáveis de ambiente (sem dependência extra)."""

    host: str = os.getenv("PARSER_HOST", "0.0.0.0")
    port: int = int(os.getenv("PARSER_PORT", "8000"))
    max_upload_mb: int = int(os.getenv("PARSER_MAX_UPLOAD_MB", "50"))

    # OCR de PDFs escaneados (mais lento; exige modelos de visão do Docling)
    do_ocr: bool = os.getenv("PARSER_DO_OCR", "false").lower() == "true"


settings = Settings()
