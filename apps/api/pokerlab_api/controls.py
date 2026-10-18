"""Strict experiment controls shared by direct Python callers and API schemas."""

MAX_SEED = 2**63 - 1


def validate_seed(seed: int) -> None:
    # bool is an int subclass; accepting it silently changes experiment intent.
    if type(seed) is not int or not 0 <= seed <= MAX_SEED:
        raise ValueError(
            "Seed must be an integer between 0 and 2^63 - 1 / 种子必须是 0 至 2^63 - 1 的整数"
        )


def validate_positive_integer(value: int, name: str) -> None:
    if type(value) is not int or value < 1:
        raise ValueError(f"{name} must be a positive integer / 次数必须是正整数")
