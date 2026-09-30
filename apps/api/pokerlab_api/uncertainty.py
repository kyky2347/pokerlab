"""Pointwise finite-sample bounds for independent equity scores in [0, 1]."""

import math

CONFIDENCE_LEVEL = 0.95
CONFIDENCE_METHOD = "hoeffding_v1"
CONFIDENCE_SCOPE = "pointwise_fixed_n"


def hoeffding_interval(mean: float, samples: int) -> tuple[float, float]:
    """Invert 2 exp(-2 n r²) = 0.05; not a time-uniform confidence sequence.

    Ties score 1/2, so a binomial success-count interval is not appropriate.
    https://ai.stanford.edu/~gwthomas/notes/concentration.html#hoeffding
    """
    if isinstance(samples, bool) or not isinstance(samples, int) or samples < 1:
        raise ValueError("Sample count must be a positive integer")
    if not math.isfinite(mean) or not 0 <= mean <= 1:
        raise ValueError("Equity mean must be finite and between zero and one")
    radius = math.sqrt(math.log(2 / (1 - CONFIDENCE_LEVEL)) / (2 * samples))
    return max(0.0, mean - radius), min(1.0, mean + radius)
