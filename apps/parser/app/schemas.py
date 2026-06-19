from pydantic import BaseModel, Field


class ParseBlockModel(BaseModel):
    type: str
    text: str | None = None
    markdown: str | None = None
    level: int | None = None
    caption: str | None = None
    pageStart: int | None = None
    pageEnd: int | None = None
    tableSource: str | None = None
    headingPath: list[str] = Field(default_factory=list)


class ParseResponse(BaseModel):
    markdown: str
    title: str | None = None
    engine: str = "docling"
    blocks: list[ParseBlockModel] = Field(default_factory=list)


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
