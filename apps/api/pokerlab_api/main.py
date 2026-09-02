from __future__ import annotations

import json
import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .cfr import RiverCFRSolver, verify_kuhn
from .config import get_settings
from .database import Experiment, SolverJob, active_database_name, get_db, initialize_database
from .domain import Card, parse_cards, validate_holdem_state
from .engine import PokerEngine, select_engine
from .range_equity import calculate_range_equity
from .ranges import range_statistics
from .research import bayesian_update, compare_agents
from .schemas import (
    AgentComparisonRequest,
    BayesianRequest,
    EVRequest,
    FixedEquityRequest,
    MonteCarloRequest,
    RangeEquityRequest,
    RangeStatisticsRequest,
    SolverRequest,
    TrainerAnswerRequest,
    TrainerQuestionRequest,
    TurnMapRequest,
)
from .trainer import create_question, score_answer, weaknesses

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)
logger = logging.getLogger("pokerlab")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    app.state.engine = select_engine()
    logger.info(json.dumps({"event": "startup", "engine": app.state.engine.name}))
    yield


app = FastAPI(
    title="PokerLab API",
    version="1.0.0",
    summary="Typed probability, simulation, decision theory, and educational CFR APIs.",
    description=(
        "Equity is defined as P(win) + 0.5 × P(tie). All stochastic endpoints accept "
        "an integer seed. The river solver uses a finite no-raise educational abstraction."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            json.dumps(
                {
                    "event": "request_error",
                    "request_id": request_id,
                    "path": request.url.path,
                    "error_category": "unhandled",
                }
            )
        )
        raise
    response.headers["x-request-id"] = request_id
    logger.info(
        json.dumps(
            {
                "event": "request_complete",
                "request_id": request_id,
                "path": request.url.path,
                "status": response.status_code,
                "runtime_ms": round((time.perf_counter() - started) * 1000, 3),
            }
        )
    )
    return response


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_poker_state",
                "message": str(exc),
                "request_id": request.headers.get("x-request-id"),
            }
        },
    )


def current_engine(request: Request) -> PokerEngine:
    return request.app.state.engine


def parse_fixed(
    payload: FixedEquityRequest,
) -> tuple[tuple[Card, Card], tuple[Card, Card], tuple[Card, ...]]:
    all_cards = parse_cards(payload.hero + payload.villain + payload.board)
    hero = (all_cards[0], all_cards[1])
    villain = (all_cards[2], all_cards[3])
    board = tuple(all_cards[4:])
    validate_holdem_state(hero, villain, board)
    return hero, villain, board


def save_experiment(
    db: Session,
    experiment_type: str,
    parameters: dict,
    results: dict,
    seed: int | None,
    engine_name: str,
) -> str:
    runtime = float(results.get("runtime_ms", 0.0))
    record = Experiment(
        experiment_type=experiment_type,
        parameters=parameters,
        results=results,
        seed=seed,
        engine=engine_name,
        runtime_ms=runtime,
    )
    db.add(record)
    db.commit()
    return record.id


def serialize_experiment(record: Experiment) -> dict:
    return {
        "id": record.id,
        "experiment_type": record.experiment_type,
        "parameters": record.parameters,
        "seed": record.seed,
        "engine": record.engine,
        "results": record.results,
        "runtime_ms": record.runtime_ms,
        "timestamp": record.created_at.isoformat(),
    }


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": "pokerlab-api"}


@app.get("/diagnostics", tags=["system"])
def diagnostics(
    request: Request, db: Session = Depends(get_db), engine: PokerEngine = Depends(current_engine)
) -> dict:
    db.execute(text("SELECT 1"))
    return {
        "status": "operational",
        "engine": engine.name,
        "database": active_database_name(),
        "kuhn_verification": verify_kuhn(5_000),
        "limits": {
            "monte_carlo_samples": settings.pokerlab_max_monte_carlo,
            "solver_iterations": settings.pokerlab_max_solver_iterations,
        },
    }


@app.post("/equity/exact", tags=["equity"])
def exact_equity(
    payload: FixedEquityRequest,
    db: Session = Depends(get_db),
    engine: PokerEngine = Depends(current_engine),
) -> dict:
    hero, villain, board = parse_fixed(payload)
    result = engine.exact_equity(hero, villain, board)
    experiment_id = save_experiment(
        db, "exact_equity", payload.model_dump(), result, None, engine.name
    )
    return {**result, "experiment_id": experiment_id}


@app.post("/equity/monte-carlo", tags=["equity"])
def monte_carlo(
    payload: MonteCarloRequest,
    db: Session = Depends(get_db),
    engine: PokerEngine = Depends(current_engine),
) -> dict:
    if payload.samples > settings.pokerlab_max_monte_carlo:
        raise ValueError(f"Sample count exceeds safety limit {settings.pokerlab_max_monte_carlo}")
    hero, villain, board = parse_fixed(payload)
    result = engine.monte_carlo(hero, villain, board, payload.samples, payload.seed)
    experiment_id = save_experiment(
        db, "monte_carlo_equity", payload.model_dump(), result, payload.seed, engine.name
    )
    return {**result, "experiment_id": experiment_id}


@app.post("/equity/turn-map", tags=["equity"])
def turn_map(payload: TurnMapRequest, engine: PokerEngine = Depends(current_engine)) -> dict:
    hero, villain, board = parse_fixed(payload)
    started = time.perf_counter()
    values = engine.turn_map(hero, villain, board)  # type: ignore[attr-defined]
    return {
        "turns": values,
        "definition": "Hero equity conditional on each legal turn card.",
        "runtime_ms": (time.perf_counter() - started) * 1000,
        "engine": engine.name,
    }


@app.post("/range/statistics", tags=["ranges"])
def get_range_statistics(payload: RangeStatisticsRequest) -> dict:
    blocked = parse_cards(payload.blocked)
    return range_statistics(payload.range, blocked)


@app.post("/range/equity", tags=["ranges"])
def range_equity(
    payload: RangeEquityRequest,
    db: Session = Depends(get_db),
    engine: PokerEngine = Depends(current_engine),
) -> dict:
    board = parse_cards(payload.board)
    result = calculate_range_equity(
        payload.hero_range,
        payload.villain_range,
        board,
        payload.seed,
        payload.samples,
    )
    result["engine"] = engine.name
    experiment_id = save_experiment(
        db, "range_equity", payload.model_dump(), result, payload.seed, engine.name
    )
    return {**result, "experiment_id": experiment_id}


@app.post("/trainer/question", tags=["trainer"])
def trainer_question(
    payload: TrainerQuestionRequest,
    db: Session = Depends(get_db),
    engine: PokerEngine = Depends(current_engine),
) -> dict:
    return create_question(payload.seed, engine, db)


@app.post("/trainer/answer", tags=["trainer"])
def trainer_answer(payload: TrainerAnswerRequest, db: Session = Depends(get_db)) -> dict:
    return score_answer(payload.question_id, payload.answer, db)


@app.get("/trainer/weaknesses", tags=["trainer"])
def trainer_weaknesses(db: Session = Depends(get_db)) -> dict:
    return {"weaknesses": weaknesses(db)}


@app.post("/ev/calculate", tags=["decision-theory"])
def ev_calculate(payload: EVRequest) -> dict:
    if payload.call_size > payload.effective_stack:
        raise ValueError("Call size cannot exceed effective stack")
    final_pot = payload.pot + payload.opponent_bet + payload.call_size
    required = payload.call_size / final_pot if final_pot else 0.0
    ev = payload.hero_equity * final_pot - payload.call_size
    curve = [
        {"equity": index / 100, "ev": index / 100 * final_pot - payload.call_size}
        for index in range(101)
    ]
    return {
        "final_pot_after_call": final_pot,
        "required_equity": required,
        "pot_odds": required,
        "incremental_call_ev": ev,
        "decision": "call" if ev > 1e-9 else "fold" if ev < -1e-9 else "break_even",
        "formula": "EV(call) = equity × final pot after call − call size",
        "curve": curve,
    }


@app.post("/solver/jobs", tags=["solver"])
def create_solver_job(
    payload: SolverRequest,
    db: Session = Depends(get_db),
    engine: PokerEngine = Depends(current_engine),
) -> dict:
    if payload.iterations > settings.pokerlab_max_solver_iterations:
        raise ValueError(
            f"Iterations exceed safety limit {settings.pokerlab_max_solver_iterations}"
        )
    board = parse_cards(payload.board)
    job = SolverJob(status="running", parameters=payload.model_dump())
    db.add(job)
    db.commit()
    started = time.perf_counter()
    try:
        solver = RiverCFRSolver(
            board,
            payload.oop_range,
            payload.ip_range,
            payload.pot,
            payload.effective_stack,
            payload.bet_small,
            payload.bet_large,
        )
        result = solver.solve(payload.iterations)
        result["engine"] = engine.name
        job.status = "completed"
        job.results = result
        job.runtime_ms = (time.perf_counter() - started) * 1000
    except Exception:
        job.status = "failed"
        db.commit()
        raise
    db.commit()
    return {"id": job.id, "status": job.status, **result}


@app.get("/solver/jobs/{job_id}", tags=["solver"])
def get_solver_job(job_id: str, db: Session = Depends(get_db)) -> dict:
    job = db.get(SolverJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Solver job not found")
    return {
        "id": job.id,
        "status": job.status,
        "parameters": job.parameters,
        "results": job.results,
        "runtime_ms": job.runtime_ms,
    }


@app.get("/solver/kuhn-verification", tags=["solver"])
def kuhn_verification() -> dict:
    return verify_kuhn()


@app.post("/research/monte-carlo", tags=["research"])
def research_monte_carlo(
    payload: MonteCarloRequest,
    db: Session = Depends(get_db),
    engine: PokerEngine = Depends(current_engine),
) -> dict:
    return monte_carlo(payload, db, engine)


@app.post("/research/bayesian", tags=["research"])
def research_bayesian(payload: BayesianRequest, db: Session = Depends(get_db)) -> dict:
    started = time.perf_counter()
    result = bayesian_update(**payload.model_dump())
    result["runtime_ms"] = (time.perf_counter() - started) * 1000
    experiment_id = save_experiment(
        db, "bayesian_opponent_model", payload.model_dump(), result, None, "SciPy"
    )
    return {**result, "experiment_id": experiment_id}


@app.post("/research/agents", tags=["research"])
def research_agents(payload: AgentComparisonRequest, db: Session = Depends(get_db)) -> dict:
    result = compare_agents(payload.episodes, payload.seed)
    experiment_id = save_experiment(
        db, "agent_comparison", payload.model_dump(), result, payload.seed, "Python reference"
    )
    return {**result, "experiment_id": experiment_id}


@app.get("/experiments", tags=["experiments"])
def list_experiments(limit: int = 50, db: Session = Depends(get_db)) -> dict:
    safe_limit = min(max(limit, 1), 200)
    records = db.scalars(
        select(Experiment).order_by(Experiment.created_at.desc()).limit(safe_limit)
    ).all()
    return {"experiments": [serialize_experiment(record) for record in records]}


@app.get("/experiments/{experiment_id}", tags=["experiments"])
def get_experiment(experiment_id: str, db: Session = Depends(get_db)) -> dict:
    record = db.get(Experiment, experiment_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return serialize_experiment(record)
