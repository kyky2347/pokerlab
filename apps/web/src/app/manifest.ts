import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PokerLab — Probability. Strategy. Uncertainty.",
    short_name: "PokerLab",
    description:
      "A bilingual laboratory for poker probability, reproducible simulation, decision theory, and finite game solving.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c100f",
    theme_color: "#0c100f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
