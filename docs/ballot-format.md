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

`parties` holds only real party labels: what the ballot printed, or the candidate's official party affiliation. Use `null` for a candidate with no known party. Record where the labels came from in an optional `party_source` field (a URL or short description).

### Ballot instructions

Two optional fields record what the ballot told voters about how many candidates to rank. `instruction` holds the ballot's own words about how many to number, quoted as closely as the source allows (with `instruction_source` saying where the text came from). `min_ranks_instructed` is the number voters were told to rank at least, such as `5` on an ACT ballot that says "Number five boxes from 1 to 5", or `null` when the ballot sets no minimum. An instructed minimum is not a rank limit: `max_ranks` can still be `null` when voters may number every box.

### Slates

In nonpartisan races, and in primaries where every candidate is in the same party, voters may still sort candidates into groups, such as candidates endorsed by the same organization. Record these in an optional `slates` list, not in `parties`:

```json
"slates": [
  {
    "name": "Portland DSA",
    "kind": "endorsement",
    "members": [3, 7, 12],
    "source": "https://example.org/endorsements-2024"
  }
]
```

- `kind` is `endorsement` (an organization endorsed these candidates), `party` (party affiliation not printed on the ballot, such as voter registration in a nonpartisan race), or `campaign` (candidates who campaigned together or asked voters to rank each other).
- A candidate can be in several slates, or none.
- Only list a slate when a public source names its members. Put the source in `source`.
