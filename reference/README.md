# Reference implementation and test elections

## Reference counter

`decay.js` is the first counter written for this project, in JavaScript. It's slow but simple, which makes it easy to check by reading. It counts Scottish-style STV (Droop quota, every ballot of a winner moves on at a fraction of a vote) and measures **reach**.

The Rust engine must match it exactly on shared test elections. To check, from the project folder:

```
python3 reference/validate.py
```

This generates 24 test elections, counts each with both programs, and compares. Expected output: `24 of 24 elections match.`

The reference counter doesn't follow Scottish law exactly: it uses full precision instead of 5 decimal places, and breaks ties by candidate number. The engine has a matching `reference` rule set for this check only. The engine's Scottish rules are checked instead by hand-checked test elections (`cargo test --release` in `engine/`) and against officially declared winners in real Scottish data.

## Hand-checked example: reach versus truncation

A single-winner ranked-choice election with 100 voters and 4 candidates. The engine tests check it (`hundred_voter_example` in `engine/src/count.rs`).

| Voters | Rank 1 | Rank 2 | Rank 3 |
|---|---|---|---|
| 40 | Ana | Ben | Cy |
| 35 | Ben | Ana | Dee |
| 15 | Cy | Ben | Ana |
| 10 | Dee | Cy | Ben |

**Full ballots:** Dee eliminated (10 votes to Cy), then Cy eliminated (25 votes to Ben). Ben wins, 60 to 40.

**Reach:** 100 votes at rank 1, 25 at rank 2, 10 at rank 3.

**Truncation:**

| Ranks kept | Winner | Same as full ballots? |
|---|---|---|
| 1 | Ana (40 to 35, with 25 ballots out of names) | No |
| 1–2 | Ben (50 to 40, with 10 ballots out of names) | Yes |
| 1–3 | Ben (60 to 40) | Yes |

**Cutoff rank:** 2. Rank 3 has reach (10 votes) but doesn't change the winner. That's the difference between the two measures.
