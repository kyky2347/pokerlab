from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

CardToken = Annotated[str, Field(pattern=r"^[2-9TJQKA][cdhs]$")]


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class FixedEquityRequest(BaseModel):
    hero: Annotated[list[CardToken], Field(min_length=2, max_length=2)]
    villain: Annotated[list[CardToken], Field(min_length=2, max_length=2)]
    board: Annotated[list[CardToken], Field(max_length=5)] = []

    @field_validator("board")
    @classmethod
    def valid_board_length(cls, value: list[str]) -> list[str]:
        if len(value) not in {0, 3, 4, 5}:
            raise ValueError("Board must contain 0, 3, 4, or 5 cards")
        return value


class MonteCarloRequest(FixedEquityRequest):
    samples: int = Field(default=50_000, ge=1, le=500_000)
    seed: int = Field(default=20250902, ge=0, le=2**63 - 1)


class TurnMapRequest(FixedEquityRequest):
    board: Annotated[list[CardToken], Field(min_length=3, max_length=3)]


class RangeEquityRequest(BaseModel):
    hero_range: dict[str, float]
    villain_range: dict[str, float]
    board: Annotated[list[CardToken], Field(max_length=5)] = []
    seed: int = Field(default=20250902, ge=0, le=2**63 - 1)
    samples: int = Field(default=20_000, ge=100, le=100_000)

    @field_validator("hero_range", "villain_range")
    @classmethod
    def valid_range(cls, value: dict[str, float]) -> dict[str, float]:
        if not value or not any(weight > 0 for weight in value.values()):
            raise ValueError("Range cannot be empty")
        if len(value) > 169:
            raise ValueError("Range cannot exceed 169 hand classes")
        if any(weight < 0 or weight > 1 for weight in value.values()):
            raise ValueError("Range weights must be between 0 and 1")
        return value


class RangeStatisticsRequest(BaseModel):
    range: dict[str, float]
    blocked: Annotated[list[CardToken], Field(max_length=9)] = []


class TrainerQuestionRequest(BaseModel):
    seed: int = Field(default=20250902, ge=0, le=2**63 - 1)


class TrainerAnswerRequest(BaseModel):
    question_id: str
    answer: float = Field(ge=0, le=1)


class EVRequest(BaseModel):
    pot: float = Field(gt=0, le=1_000_000)
    opponent_bet: float = Field(ge=0, le=1_000_000)
    call_size: float = Field(ge=0, le=1_000_000)
    hero_equity: float = Field(ge=0, le=1)
    effective_stack: float = Field(gt=0, le=1_000_000)


class SolverRequest(BaseModel):
    board: Annotated[list[CardToken], Field(min_length=5, max_length=5)]
    oop_range: dict[str, float]
    ip_range: dict[str, float]
    pot: float = Field(default=100, gt=0, le=100_000)
    effective_stack: float = Field(default=100, gt=0, le=100_000)
    bet_small: float = Field(default=0.5, gt=0, le=1)
    bet_large: float = Field(default=1.0, gt=0, le=2)
    iterations: int = Field(default=2_000, ge=100, le=100_000)

    @field_validator("oop_range", "ip_range")
    @classmethod
    def solver_range(cls, value: dict[str, float]) -> dict[str, float]:
        if not value or not any(weight > 0 for weight in value.values()):
            raise ValueError("Solver range cannot be empty")
        if len(value) > 40:
            raise ValueError("Solver Lite accepts at most 40 hand classes per player")
        return value


class BayesianRequest(BaseModel):
    alpha: float = Field(default=2, gt=0, le=1000)
    beta: float = Field(default=2, gt=0, le=1000)
    aggressive_actions: int = Field(default=4, ge=0, le=100_000)
    passive_actions: int = Field(default=3, ge=0, le=100_000)
    credible_level: float = Field(default=0.95, gt=0.5, lt=1)


class AgentComparisonRequest(BaseModel):
    episodes: Literal[100, 1000, 10000] = 1000
    seed: int = Field(default=20250902, ge=0, le=2**63 - 1)
