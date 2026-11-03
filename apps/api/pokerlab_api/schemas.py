from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .controls import MAX_SEED

CardToken = Annotated[str, Field(pattern=r"^[2-9TJQKA][cdhs]$")]
FiniteNumber = Annotated[
    float,
    Field(
        strict=True,
        allow_inf_nan=False,
        description=(
            "Finite JSON number; booleans and strings are rejected. / "
            "仅接受有限 JSON 数值，不接受布尔值或字符串。"
        ),
    ),
]
RangeWeight = Annotated[
    float,
    Field(
        strict=True,
        ge=0,
        le=1,
        allow_inf_nan=False,
        description=(
            "Finite JSON number from 0 to 1, inclusive; booleans and strings are rejected. / "
            "0 至 1 的有限 JSON 数值（含端点）；不接受布尔值或字符串。"
        ),
    ),
]
INTEGER_CONTROL_DESCRIPTION = (
    "JSON integer only; booleans, strings and floating-point values are rejected. / "
    "仅接受 JSON 整数，不接受布尔值、字符串或浮点数。"
)
Seed = Annotated[
    int,
    Field(
        strict=True,
        ge=0,
        le=MAX_SEED,
        description=(
            f"{INTEGER_CONTROL_DESCRIPTION} "
            f"Inclusive seed range / 种子范围（含端点）: 0–{MAX_SEED}."
        ),
    ),
]


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class FixedEquityRequest(BaseModel):
    hero: Annotated[list[CardToken], Field(min_length=2, max_length=2)]
    villain: Annotated[list[CardToken], Field(min_length=2, max_length=2)]
    board: Annotated[list[CardToken], Field(max_length=5)] = Field(default_factory=list)

    @field_validator("board")
    @classmethod
    def valid_board_length(cls, value: list[str]) -> list[str]:
        if len(value) not in {0, 3, 4, 5}:
            raise ValueError("Board must contain 0, 3, 4, or 5 cards")
        return value


class MonteCarloRequest(FixedEquityRequest):
    samples: int = Field(
        default=50_000, ge=1, le=500_000, strict=True, description=INTEGER_CONTROL_DESCRIPTION
    )
    seed: Seed = 20250902


class TurnMapRequest(FixedEquityRequest):
    board: Annotated[list[CardToken], Field(min_length=3, max_length=3)]


class RangeEquityRequest(BaseModel):
    hero_range: dict[str, RangeWeight]
    villain_range: dict[str, RangeWeight]
    board: Annotated[list[CardToken], Field(max_length=5)] = Field(default_factory=list)
    seed: Seed = 20250902
    samples: int = Field(
        default=20_000, ge=100, le=100_000, strict=True, description=INTEGER_CONTROL_DESCRIPTION
    )

    @field_validator("hero_range", "villain_range")
    @classmethod
    def valid_range(cls, value: dict[str, float]) -> dict[str, float]:
        if not value or not any(weight > 0 for weight in value.values()):
            raise ValueError("Range cannot be empty")
        if len(value) > 169:
            raise ValueError("Range cannot exceed 169 hand classes")
        return value

    @field_validator("board")
    @classmethod
    def valid_board_length(cls, value: list[str]) -> list[str]:
        if len(value) not in {0, 3, 4, 5}:
            raise ValueError("Board must contain 0, 3, 4, or 5 cards")
        return value


class RangeStatisticsRequest(BaseModel):
    range: dict[str, RangeWeight]
    blocked: Annotated[list[CardToken], Field(max_length=9)] = Field(default_factory=list)

    @field_validator("range")
    @classmethod
    def valid_range(cls, value: dict[str, float]) -> dict[str, float]:
        if len(value) > 169:
            raise ValueError("Range cannot exceed 169 hand classes")
        return value


class TrainerQuestionRequest(BaseModel):
    seed: Seed = 20250902


class TrainerAnswerRequest(BaseModel):
    question_id: str
    answer: FiniteNumber = Field(ge=0, le=1)


class EVRequest(BaseModel):
    pot: FiniteNumber = Field(gt=0, le=1_000_000)
    opponent_bet: FiniteNumber = Field(ge=0, le=1_000_000)
    call_size: FiniteNumber = Field(ge=0, le=1_000_000)
    hero_equity: FiniteNumber = Field(ge=0, le=1)
    effective_stack: FiniteNumber = Field(gt=0, le=1_000_000)

    @model_validator(mode="after")
    def legal_call_geometry(self) -> EVRequest:
        if self.opponent_bet > self.effective_stack:
            raise ValueError("Opponent bet cannot exceed effective stack")
        if self.call_size > self.opponent_bet:
            raise ValueError("Call size cannot exceed the opponent bet")
        if self.call_size > self.effective_stack:
            raise ValueError("Call size cannot exceed effective stack")
        return self


class SolverRequest(BaseModel):
    board: Annotated[list[CardToken], Field(min_length=5, max_length=5)]
    oop_range: dict[str, RangeWeight]
    ip_range: dict[str, RangeWeight]
    pot: FiniteNumber = Field(default=100, gt=0, le=100_000)
    effective_stack: FiniteNumber = Field(default=100, gt=0, le=100_000)
    bet_small: FiniteNumber = Field(default=0.5, gt=0, le=1)
    bet_large: FiniteNumber = Field(default=1.0, gt=0, le=2)
    iterations: int = Field(
        default=2_000, ge=100, le=100_000, strict=True, description=INTEGER_CONTROL_DESCRIPTION
    )

    @field_validator("oop_range", "ip_range")
    @classmethod
    def solver_range(cls, value: dict[str, float]) -> dict[str, float]:
        if not value or not any(weight > 0 for weight in value.values()):
            raise ValueError("Solver range cannot be empty")
        if len(value) > 40:
            raise ValueError("Solver Lite accepts at most 40 hand classes per player")
        return value

    @model_validator(mode="after")
    def distinct_bet_sizes(self) -> SolverRequest:
        if self.bet_small >= self.bet_large:
            raise ValueError("Small bet must be strictly smaller than large bet")
        small_amount = min(self.effective_stack, self.pot * self.bet_small)
        large_amount = min(self.effective_stack, self.pot * self.bet_large)
        if math.isclose(small_amount, large_amount):
            raise ValueError(
                "Effective stack collapses both bet sizes; increase stack or reduce the small bet"
            )
        return self


class BayesianRequest(BaseModel):
    alpha: float = Field(default=2, gt=0, le=1000, strict=True)
    beta: float = Field(default=2, gt=0, le=1000, strict=True)
    aggressive_actions: int = Field(default=4, ge=0, le=100_000, strict=True)
    passive_actions: int = Field(default=3, ge=0, le=100_000, strict=True)
    credible_level: float = Field(default=0.95, gt=0.5, lt=1, strict=True)


class AgentComparisonRequest(BaseModel):
    episodes: Literal[100, 1000, 10000] = Field(
        default=1000, description=INTEGER_CONTROL_DESCRIPTION
    )
    seed: Seed = 20250902

    @field_validator("episodes", mode="before")
    @classmethod
    def integer_episodes(cls, value: int) -> int:
        # Literal's enum check alone also accepts equal floating-point values.
        if type(value) is not int:
            raise ValueError("Episode count must be an integer / 实验局数必须是整数")
        return value
