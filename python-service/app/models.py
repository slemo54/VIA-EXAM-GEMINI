from pydantic import BaseModel, Field
from typing import List, Optional, Union

class JobConfig(BaseModel):
    num_questions: int = Field(default=100)
    options: List[str] = Field(default=["A", "B", "C", "D", "E"])

class ProcessingRequest(BaseModel):
    submission_id: str
    file_url: str
    expected_pages: int = Field(default=2)
    config: JobConfig

class BubbleResult(BaseModel):
    question: int
    detected_answer: Union[str, List[str], None]
    status: str # 'answered', 'blank', 'ambiguous'
    confidence: float
    reason: str

class ProcessingMetrics(BaseModel):
    deskew_angle: float
    processing_time_ms: int

class ProcessingResponse(BaseModel):
    submission_id: str
    status: str
    annotated_image_urls: List[str]
    metrics: ProcessingMetrics
    results: List[BubbleResult]
