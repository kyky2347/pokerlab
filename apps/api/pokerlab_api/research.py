from __future__ import annotations

import random
import time

import numpy as np
from scipy.stats import beta as beta_distribution


def bayesian_update(
    alpha: float,
    beta: float,
    aggressive_actions: int,
    passive_actions: int,
    credible_level: float,
) -> dict:
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
    """Compare transparent threshold policies on generated river call decisions."""
    started = time.perf_counter()
    rng = random.Random(seed)
    totals = {
        name: {"ev": 0.0, "regret": 0.0, "squared": 0.0}
        for name in ("RandomAgent", "PotOddsAgent", "EquityAgent", "CFRAgent")
    }
    for _ in range(episodes):
        pot = rng.uniform(40, 200)
        call = rng.uniform(10, pot)
        equity = rng.random()
        call_ev = equity * (pot + call) - (1 - equity) * call
        optimal_ev = max(0.0, call_ev)
        required = call / (pot + 2 * call)
        decisions = {
            "RandomAgent": rng.random() < 0.5,
            "PotOddsAgent": equity >= required + 0.04,
            "EquityAgent": call_ev >= 0,
            # A soft regret-matched policy near the decision boundary.
            "CFRAgent": rng.random() < 1 / (1 + np.exp(-call_ev / max(1.0, pot * 0.03))),
        }
        for name, calls in decisions.items():
            realized = call_ev if calls else 0.0
            regret = optimal_ev - realized
            totals[name]["ev"] += realized
            totals[name]["regret"] += regret
            totals[name]["squared"] += realized * realized
    agents = []
    for name, total in totals.items():
        mean = total["ev"] / episodes
        variance = max(0.0, total["squared"] / episodes - mean * mean)
        agents.append(
            {
                "agent": name,
                "average_ev": mean,
                "decision_regret": total["regret"] / episodes,
                "variance": variance,
            }
        )
    return {
        "episodes": episodes,
        "seed": seed,
        "agents": agents,
        "runtime_ms": (time.perf_counter() - started) * 1000,
        "scope": "Generated one-street river call/fold decisions; not complete poker strength.",
    }
