from pydantic import BaseModel


class ParseResponse(BaseModel):
    markdown: str
    title: str | None = None
    engine: str = "docling"


class HealthResponse(BaseModel):
    status: str
    engine: str = "docling"
