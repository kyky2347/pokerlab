# Solver limitations / 求解器限制

PokerLab labels the module **Educational Approximate Solver** because its tree is intentionally finite.

- Heads-up and river only.
- Five fixed board cards and fixed weighted ranges.
- OOP may check, bet a small size, or bet a large size.
- After a check, IP may check, bet small, or bet large.
- Facing a bet, the other player may fold or call.
- No raises, no earlier streets, no dynamic stack geometry, no rake.
- Private information sets use exact physical combos and public action history; the UI aggregates results into 169 hand classes.
- Terminal showdowns use the real seven-card evaluator and blocker-compatible combo pairs.
- The displayed "average regret" is a normalized positive-regret diagnostic, not rigorous exploitability.

本模块适合学习信息集、到达概率、遗憾匹配和混合策略，不应被描述为职业级 GTO 求解器，也不应被用于实时牌局决策。
