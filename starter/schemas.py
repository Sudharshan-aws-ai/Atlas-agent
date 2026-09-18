"""
Schemas for Study Sentinel Hackathon — Problem 1 (ATLAS).

CRITICAL: DO NOT MODIFY THIS FILE.
The grader imports Question, Answer, and RecordRef directly from this module.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class QuestionCategory(str, Enum):
    COUNT = "COUNT"
    LOOKUP = "LOOKUP"
    FINDING = "FINDING"
    TRAP = "TRAP"


class RecordRef(BaseModel):
    """
    Identifies a single record uniquely across the study.
    (domain, usubjid, seq) forms the universal triple identity.
    """
    domain: str = Field(..., description="Domain code, e.g. LB, AE, EX, DS, VS, EG, CM, MH, DM")
    usubjid: str = Field(..., description="Universal Subject Identifier, e.g. 042-S07-001")
    seq: int = Field(..., description="Domain sequence number, e.g. 1, 25")

    model_config = ConfigDict(frozen=True)

    @property
    def key(self) -> str:
        return f"{self.domain.upper()}|{self.usubjid}|{self.seq}"

    def to_triple(self) -> tuple[str, str, int]:
        return (self.domain.upper(), self.usubjid, self.seq)

    def __str__(self) -> str:
        return self.key

    def __repr__(self) -> str:
        return f"RecordRef(domain='{self.domain}', usubjid='{self.usubjid}', seq={self.seq})"


class Question(BaseModel):
    """
    Represents an incoming inquiry to the Atlas Agent.
    """
    question_id: str = Field(..., description="Unique question identifier, e.g. Q01")
    text: str = Field(..., description="Natural language question text")
    category: Optional[QuestionCategory] = Field(default=None, description="Optional question category")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional structured parameters")

    model_config = ConfigDict(extra="ignore")


class Answer(BaseModel):
    """
    Represents the verified response from Atlas Agent.
    """
    question_id: str = Field(..., description="Matching question identifier")
    answer: Any = Field(..., description="Computed answer (count, list of subjects, record list, or [] for traps)")
    text: str = Field(..., description="Human-readable explanation of the finding and determination")
    evidence: List[RecordRef] = Field(default_factory=list, description="Verified supporting records")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Confidence score [0.0, 1.0]")
    steps_used: List[str] = Field(default_factory=list, description="Audit trace of reasoning and query steps taken")
    tokens_used: int = Field(default=0, description="Tokens consumed (0 for deterministic execution)")

    model_config = ConfigDict(extra="ignore")
