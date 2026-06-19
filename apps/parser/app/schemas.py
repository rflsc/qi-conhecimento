from pydantic import BaseModel


class ParseResponse(BaseModel):
    markdown: str
    title: str | None = None
    engine: str = "docling"


class HealthResponse(BaseModel):
    status: str
    engine: str = "docling"


class ParseProgressResponse(BaseModel):
    job_id: str
    status: str
    pages_total: int = 0
    pages_done: int = 0
    batch_index: int = 0
    batch_count: int = 0
    batch_start_page: int = 0
    batch_end_page: int = 0
    message: str = ""
