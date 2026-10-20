# Ballot file format

One election per file, plain text, with the extension `.ballots`. The engine reads this format with `stvsim count <file>`, and the real-data scripts in `data/` write it.

```
# Any line starting with # is a comment.
candidates 7
seats 3
# Each ballot line: how many voters cast this exact ballot, then candidate
# numbers from first choice down. Candidates are numbered from 0.
# Ballots can be any length from 1 up to the number of candidates.
1520 3 0 5
870 2
44 6 1 0 4 2 3 5
```

Rules:

- `candidates` and `seats` come first, in that order.
- A ballot line lists each candidate at most once. Skipped ranks and repeated candidates are cleaned up before writing, and the cleanup rule is recorded in the source's README in `data/`.
- Blank ballots (no valid ranking) are left out. Their count is recorded in the metadata file, because they don't count toward the quota.

## Metadata

Each `.ballots` file has a matching `.json` file with the same name:

```json
{
  "source": "short name of the data source, matching data/<source>/README.md",
  "election": "human-readable name, such as 'Glasgow 2022, Ward 5 (Govan)'",
  "date": "2022-05-05",
  "system": "scottish-stv",
  "candidates": ["Name A", "Name B"],
  "parties": ["SNP", "Labour"],
  "official_winners": [0, 3],
  "blank_ballots": 12,
  "notes": "anything unusual"
}
```

`parties` and `official_winners` can be `null` when the source doesn't give them. `official_winners` lists candidate numbers, using the same numbering as the ballot file, of the candidates the official count declared elected. The engine uses these to check its counting against real results.
