from __future__ import annotations

import math
import random
import time

import numpy as np
from scipy.stats import beta as beta_distribution
from scipy.stats import t as student_t

from .controls import validate_seed


def _beta_bin_masses(edges: np.ndarray, alpha: float, beta: float) -> np.ndarray:
    cdf = beta_distribution.cdf(edges, alpha, beta)
    survival = beta_distribution.sf(edges, alpha, beta)
    # Use survival differences in the upper tail to avoid subtracting two
    # CDF values rounded to 1. Do not normalize away a failed computation.
    mass = np.where(cdf[:-1] <= 0.5, np.diff(cdf), -np.diff(survival))
    if (
        not np.all(np.isfinite(cdf))
        or not np.all(np.isfinite(survival))
        or not np.all(np.isfinite(mass))
        or np.any(mass < 0)
        or not math.isclose(math.fsum(mass), 1.0, rel_tol=0, abs_tol=1e-12)
    ):
        raise ValueError(
            "Beta distribution cannot be resolved numerically / 无法可靠计算该 Beta 分布"
        )
    return mass


def bayesian_update(
    alpha: float,
    beta: float,
    aggressive_actions: int,
    passive_actions: int,
    credible_level: float,
) -> dict:
    if any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not 0 < value <= 1000
        or not math.isfinite(value)
        for value in (alpha, beta)
    ):
        raise ValueError("Beta prior parameters must be finite and in (0, 1000]")
    if any(
        type(value) is not int or not 0 <= value <= 100_000
        for value in (aggressive_actions, passive_actions)
    ):
        raise ValueError("Observed action counts must be integers between 0 and 100000")
    if (
        isinstance(credible_level, bool)
        or not isinstance(credible_level, (int, float))
        or not 0.5 < credible_level < 1
    ):
        raise ValueError("Credible level must be between 0.5 and 1")
    posterior_alpha = alpha + aggressive_actions
    posterior_beta = beta + passive_actions
    tail = (1 - credible_level) / 2
    grid = np.linspace(0.001, 0.999, 120)
    prior = beta_distribution.pdf(grid, alpha, beta)
    posterior = beta_distribution.pdf(grid, posterior_alpha, posterior_beta)
    interval = [
        float(beta_distribution.ppf(tail, posterior_alpha, posterior_beta)),
        float(beta_distribution.isf(tail, posterior_alpha, posterior_beta)),
    ]
    if (
        not np.all(np.isfinite(prior))
        or not np.all(np.isfinite(posterior))
        or not all(math.isfinite(value) for value in interval)
        or not 0 <= interval[0] <= interval[1] <= 1
    ):
        raise ValueError(
            "Beta distribution cannot be resolved numerically / 无法可靠计算该 Beta 分布"
        )
    edges = np.linspace(0.0, 1.0, 201)
    widths = np.diff(edges)
    prior_mass = _beta_bin_masses(edges, alpha, beta)
    posterior_mass = _beta_bin_masses(edges, posterior_alpha, posterior_beta)
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
        "distribution": {
            "method": "beta-cdf-bins-v1",
            "bin_count": 200,
            "domain": [0.0, 1.0],
            "bins": [
                {
                    "left": float(edges[index]),
                    "right": float(edges[index + 1]),
                    "prior_mass": float(prior_mass[index]),
                    "posterior_mass": float(posterior_mass[index]),
                    "prior_density": float(prior_mass[index] / widths[index]),
                    "posterior_density": float(posterior_mass[index] / widths[index]),
                }
                for index in range(200)
            ],
            "density_units": "probability per unit p",
            "limitations": (
                "Bin-average densities, not pointwise PDF heights. Each bin spans 0.5 percentage "
                "points; within-bin shape is unresolved. Very small tail probabilities may "
                "underflow in floating point. Credible intervals use Beta quantiles independently. "
                "Quantiles may round to 0 or 1; endpoint rounding is not certainty. "
                "The legacy density field remains point-sampled and can miss narrow peaks."
            ),
        },
        "interpretation": "Beta prior updated by aggressive successes and passive opportunities.",
    }


def compare_agents(episodes: int, seed: int) -> dict:
    """Evaluate fixed policies on shared synthetic decisions, not poker matches."""
    if type(episodes) is not int or not 2 <= episodes <= 10_000:
        raise ValueError("Episode count must be an integer between 2 and 10000")
    validate_seed(seed)
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
