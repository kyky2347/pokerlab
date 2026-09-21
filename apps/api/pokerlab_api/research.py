from __future__ import annotations

import math
import random
import time

import numpy as np
from scipy.stats import beta as beta_distribution
from scipy.stats import t as student_t


def bayesian_update(
    alpha: float,
    beta: float,
    aggressive_actions: int,
    passive_actions: int,
    credible_level: float,
) -> dict:
    if alpha <= 0 or beta <= 0:
        raise ValueError("Beta prior parameters must be positive")
    if aggressive_actions < 0 or passive_actions < 0:
        raise ValueError("Observed action counts cannot be negative")
    if not 0.5 < credible_level < 1:
        raise ValueError("Credible level must be between 0.5 and 1")
    posterior_alpha = alpha + aggressive_actions
    posterior_beta = beta + passive_actions
    tail = (1 - credible_level) / 2
    grid = np.linspace(0.001, 0.999, 120)
    prior = beta_distribution.pdf(grid, alpha, beta)
    posterior = beta_distribution.pdf(grid, posterior_alpha, posterior_beta)
    interval = beta_distribution.ppf([tail, 1 - tail], posterior_alpha, posterior_beta).tolist()
    return {
        "prior": {"alpha": alpha, "beta": beta, "mean": alpha / (alpha + beta)},
        "posterior": {
            "alpha": posterior_alpha,
            "beta": posterior_beta,
            "mean": posterior_alpha / (posterior_alpha + posterior_beta),
            "credible_level": credible_level,
            "credible_interval": interval,
        },
        "density": [
            {"p": float(x), "prior": float(y0), "posterior": float(y1)}
            for x, y0, y1 in zip(grid, prior, posterior, strict=True)
        ],
        "interpretation": "Beta prior updated by aggressive successes and passive opportunities.",
    }


def compare_agents(episodes: int, seed: int) -> dict:
    """Evaluate fixed policies on shared synthetic decisions, not poker matches."""
    if type(episodes) is not int or not 2 <= episodes <= 10_000:
        raise ValueError("Episode count must be an integer between 2 and 10000")
    if type(seed) is not int or not 0 <= seed <= 2**63 - 1:
        raise ValueError("Seed must be an integer between 0 and 2^63 - 1")
    started = time.perf_counter()
    rng = random.Random(seed)
    names = ("RandomAgent", "TightThresholdAgent", "PotOddsAgent", "SoftmaxAgent")
    outcomes: dict[str, list[float]] = {name: [] for name in names}
    regrets: dict[str, list[float]] = {name: [] for name in names}
    calls_made = dict.fromkeys(names, 0)
    for _ in range(episodes):
        pot = rng.uniform(40, 200)
        call = rng.uniform(10, pot)
        equity = rng.random()
        call_ev = equity * (pot + call) - (1 - equity) * call
        optimal_ev = max(0.0, call_ev)
        required = call / (pot + 2 * call)
        decisions = {
            "RandomAgent": rng.random() < 0.5,
            "TightThresholdAgent": equity >= required + 0.04,
            "PotOddsAgent": call_ev >= 0,
            # Fixed logistic policy: no learning, regret matching, or CFR solver.
            "SoftmaxAgent": rng.random() < 1 / (1 + np.exp(-call_ev / max(1.0, pot * 0.03))),
        }
        for name, calls in decisions.items():
            # Conditional EV of the chosen action, NOT a sampled win/loss payout.
            decision_ev = call_ev if calls else 0.0
            outcomes[name].append(decision_ev)
            regrets[name].append(optimal_ev - decision_ev)
            calls_made[name] += int(calls)
    critical_value = float(student_t.ppf(0.975, df=episodes - 1))
    agents = []
    for name, values in outcomes.items():
        mean = math.fsum(values) / episodes
        # Keep the existing population-variance field (divisor n). Use n - 1
        # for the sample variance in the standard error; centered sums are stable.
        variance = math.fsum((value - mean) ** 2 for value in values) / episodes
        standard_error = math.sqrt(variance / (episodes - 1))
        margin = critical_value * standard_error
        agents.append(
            {
                "agent": name,
                "average_ev": mean,
                "decision_regret": math.fsum(regrets[name]) / episodes,
                "variance": variance,
                "call_frequency": calls_made[name] / episodes,
                "standard_error": standard_error,
                "ci_low": mean - margin,
                "ci_high": mean + margin,
            }
        )
    return {
        "episodes": episodes,
        "seed": seed,
        "agents": agents,
        "benchmark_version": "river-call-fold-v2",
        "confidence_level": 0.95,
        "methodology": {
            "units": "chips per decision; variance in squared chips",
            "scenario_distribution": (
                "pot ~ Uniform(40, 200); call ~ Uniform(10, pot); equity ~ Uniform(0, 1)"
            ),
            "shared_scenarios": True,
            "ev_formula": "EV(call) = equity * (pot + 2 * call) - call; EV(fold) = 0",
            "pot_definition": "Pot before the opponent bets; opponent bet equals call size",
            "policies": {
                "RandomAgent": "Call with probability 0.5",
                "TightThresholdAgent": "Call when equity >= call / (pot + 2 * call) + 0.04",
                "PotOddsAgent": "Call when EV(call) >= 0; knows the generated true equity",
                "SoftmaxAgent": "Call with probability sigmoid(EV(call) / max(1, pot * 0.03))",
            },
            "confidence_method": "mean +/- t(0.975, n - 1) * sample_std / sqrt(n)",
            "limitations": (
                "Approximate marginal mean-EV intervals, not pairwise significance tests. "
                "Conditional action EVs, not realized winnings. Synthetic independent decisions, "
                "no cards, opponent adaptation, learning, or CFR training."
            ),
        },
        "runtime_ms": (time.perf_counter() - started) * 1000,
        "scope": "Generated one-street river call/fold decisions; not complete poker strength.",
    }
