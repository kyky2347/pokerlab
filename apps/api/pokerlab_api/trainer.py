from __future__ import annotations

import random
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import TrainerAnswer
from .domain import Card
from .engine import PokerEngine


@dataclass(frozen=True, slots=True)
class Scenario:
    category: str
    difficulty: str
    hero: tuple[str, str]
    villain: tuple[str, str]
    board: tuple[str, ...]


SCENARIOS = (
    Scenario("pair_vs_overcards", "core", ("Qh", "Qd"), ("As", "Ks"), ("Js", "8s", "2c")),
    Scenario("flush_draw", "core", ("As", "Ks"), ("Qh", "Qd"), ("Js", "8s", "2c")),
    Scenario("straight_draw", "core", ("9c", "8d"), ("Ah", "Ad"), ("7s", "6h", "2c")),
    Scenario("combo_draw", "advanced", ("Jh", "Th"), ("As", "Ac"), ("9h", "8h", "2d")),
    Scenario("overpair", "core", ("Kh", "Kd"), ("Ah", "Qh"), ("Js", "7c", "3d")),
    Scenario("top_pair", "core", ("As", "Qd"), ("Kh", "Kd"), ("Ah", "8c", "3s")),
    Scenario("two_pair", "advanced", ("Ac", "8d"), ("Jh", "Jc"), ("As", "8s", "2h")),
    Scenario("set", "advanced", ("8h", "8d"), ("As", "Ks"), ("8s", "7s", "2c")),
    Scenario("turn_decision", "advanced", ("Qh", "Jh"), ("As", "Ad"), ("Th", "9h", "2c", "3s")),
)

QUESTION_CACHE: dict[str, dict] = {}


def weaknesses(db: Session) -> list[dict[str, float | str | int]]:
    rows = db.execute(
        select(
            TrainerAnswer.category,
            func.avg(TrainerAnswer.absolute_error),
            func.count(TrainerAnswer.id),
        ).group_by(TrainerAnswer.category)
    ).all()
    return [
        {"category": category, "average_error": float(error), "answers": int(count)}
        for category, error, count in sorted(rows, key=lambda row: row[1], reverse=True)
    ]


def create_question(seed: int, engine: PokerEngine, db: Session) -> dict:
    stats = {row["category"]: row["average_error"] for row in weaknesses(db)}
    weights = [1.0 + 10.0 * stats.get(scenario.category, 0.0) for scenario in SCENARIOS]
    rng = random.Random(seed)
    scenario = rng.choices(SCENARIOS, weights=weights, k=1)[0]
    hero = tuple(Card.parse(token) for token in scenario.hero)
    villain = tuple(Card.parse(token) for token in scenario.villain)
    board = tuple(Card.parse(token) for token in scenario.board)
    result = engine.exact_equity(hero, villain, board)
    question_id = str(uuid4())
    QUESTION_CACHE[question_id] = {"scenario": scenario, "true_equity": result["equity"]}
    return {
        "id": question_id,
        "hero": scenario.hero,
        "villain": scenario.villain,
        "board": scenario.board,
        "category": scenario.category,
        "difficulty": scenario.difficulty,
        "seed": seed,
        "adaptive_weight": 1 + 10 * stats.get(scenario.category, 0.0),
    }


def score_answer(question_id: str, answer: float, db: Session) -> dict:
    cached = QUESTION_CACHE.pop(question_id, None)
    if cached is None:
        raise ValueError("Question expired or was already answered")
    scenario: Scenario = cached["scenario"]
    true_equity = float(cached["true_equity"])
    error = abs(answer - true_equity)
    # Quadratic continuous score: 100 at zero error, 0 at or beyond 25 percentage points.
    score = 100 * max(0.0, 1 - (error / 0.25) ** 2)
    record = TrainerAnswer(
        category=scenario.category,
        difficulty=scenario.difficulty,
        answer=answer,
        true_equity=true_equity,
        absolute_error=error,
        score=score,
    )
    db.add(record)
    db.commit()
    return {
        "answer": answer,
        "true_equity": true_equity,
        "absolute_error": error,
        "score": score,
        "category": scenario.category,
        "scoring": "100 × max(0, 1 - (absolute_error / 0.25)²)",
        "weaknesses": weaknesses(db),
    }
