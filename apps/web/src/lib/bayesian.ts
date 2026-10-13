import type { BayesianDistribution } from "./types";

export function bayesianChartData(distribution?: BayesianDistribution) {
  if (
    distribution?.method !== "beta-cdf-bins-v1" ||
    distribution.bin_count !== 200 ||
    !Array.isArray(distribution.domain) ||
    distribution.domain.length !== 2 ||
    distribution.domain?.[0] !== 0 ||
    distribution.domain?.[1] !== 1 ||
    !Array.isArray(distribution.bins) ||
    distribution.bins?.length !== distribution.bin_count
  )
    return null;

  const bins = distribution.bins;
  if (bins[0]?.left !== 0 || bins.at(-1)?.right !== 1) return null;
  if (
    bins.some(
      (bin, index) =>
        bin == null ||
        typeof bin !== "object" ||
        ![
          bin.left,
          bin.right,
          bin.prior_mass,
          bin.posterior_mass,
          bin.prior_density,
          bin.posterior_density,
        ].every((value) => Number.isFinite(value) && value >= 0) ||
        bin.left >= bin.right ||
        Math.abs(bin.right - bin.left - 0.005) > 1e-12 ||
        bin.right > 1 ||
        bin.prior_mass > 1 ||
        bin.posterior_mass > 1 ||
        (index > 0 && bin.left !== bins[index - 1].right),
    )
  )
    return null;

  // Geometry only: statistics and densities come from the API. The final point
  // closes the last step at p=1; it is not an additional probability bin.
  return [
    ...bins.map((bin) => ({ ...bin, p: bin.left })),
    { ...bins.at(-1)!, p: 1 },
  ];
}
