# Slate size under STV, Borda, and approval (2026-10-25)

Question (Genevieve): how does Borda's sensitivity to slate size show up?

Setup: 1,000 voters, 5 seats. Slate A has 40% of voters and runs 1 to 12 candidates; slate B has
60% and runs 5. A slate's total pull is split among its candidates, so running more doesn't win
new supporters. Voters pick one candidate at a time in proportion to popularity (spread 0.5) times
4 ("loose") or 100 ("tight") for their own slate. Ballots rank 5 candidates, or every candidate.
1,000 elections per point, seed 1, engine commit 356015e plus `engine/examples/slate_size.rs`.
This is a simplified illustration, not the project's voter model.

Files: `slate_size.jsonl` (per slate size and system, how often slate A won 0 to 5 seats),
`slate-size.html` (the published page), `page.template.html` (page before data is filled in).

Findings: STV gives tight slate A its fair 2 seats at every slate size. Borda with full ballots
rewards running more (0.83 seats at 2 candidates, 1.56 at 12); Borda with 5-rank ballots punishes
it (0 seats from 8 candidates). With loose slates every method peaks at 3 to 4 candidates; STV
falls slowly (1.35 at 12), Borda and approval fast (0.67 at 12).
