import os


class Settings:
    """Configuração lida de variáveis de ambiente (sem dependência extra)."""

    host: str = os.getenv("PARSER_HOST", "0.0.0.0")
    port: int = int(os.getenv("PARSER_PORT", "8000"))
    max_upload_mb: int = int(os.getenv("PARSER_MAX_UPLOAD_MB", "150"))

    # OCR de PDFs escaneados (mais lento e consome mais RAM)
    do_ocr: bool = os.getenv("PARSER_DO_OCR", "false").lower() == "true"

    # Backend pypdfium2 — mais leve; recomendado em máquinas com <16 GB RAM
    low_memory: bool = os.getenv("PARSER_LOW_MEMORY", "true").lower() == "true"

    # Processa PDFs em lotes de N páginas (0 = documento inteiro de uma vez)
    page_batch_size: int = int(os.getenv("PARSER_PAGE_BATCH_SIZE", "15"))

    # Extração de estrutura de tabelas (linhas/colunas/células)
    do_table_structure: bool = os.getenv("PARSER_DO_TABLE_STRUCTURE", "true").lower() == "true"

    # Modo do TableFormer: "accurate" (melhor qualidade, mais lento) ou "fast"
    table_mode: str = os.getenv("PARSER_TABLE_MODE", "accurate").lower()

    # Casa células detectadas com o texto do PDF — melhora tabelas com texto selecionável
    table_cell_matching: bool = os.getenv("PARSER_TABLE_CELL_MATCHING", "true").lower() == "true"


settings = Settings()
