# PokerLab engineering rules

- Mathematical correctness has priority over feature speed.
- Never modify core probability behavior without tests.
- Never display fake statistics or solver outputs.
- Never permit duplicate cards at the domain boundary.
- Poker core is the source of truth; the frontend does not calculate canonical equity.
- All stochastic experiments accept a seed and preserve deterministic reproduction.
- Third-party poker evaluators are test-only. Third-party poker solvers are prohibited.
- Every solver limitation must be visible to users.
- Run relevant tests after changes and browser verification after visual changes.
- No unfinished TODO placeholders in user-facing flows.
- Do not mark tasks complete while relevant tests are failing.
- Preserve the automatic Rust-to-Python engine fallback and expose the selected engine.
- UI copy and documentation should remain available in English and Chinese.
