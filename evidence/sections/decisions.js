// The model decisions, shown on the overview tab and at the top of each tab.
// Keep in step with docs/model-review.md.
const DECISIONS = {
  "ballot-length": {
    title: "Ballot length",
    status: "Approved October 20, 2026",
    now: "Every simulated voter ranks every candidate, up to a cap of 100.",
    proposal: "Two settings. Electorate type (public voters, tuned to Scotland, or organization members, tuned to the union and society elections) sets how far each voter naturally ranks; it grows with the number of candidates, and much less with seats. Ballot rules set a maximum (none, equal to the seats, or another number) and an optional minimum instruction. Voters rank their own slate first, then continue to their natural length. A maximum cuts ballots and can pull voters up to it; a minimum pulls most voters up to it.",
    needed: "Nothing for now. The ballot wording (\"up to N\", \"at least N\", or \"exactly N\") becomes a control in the model tuner, so you can try each. Default: up to N, with N equal to the seats.",
  },
  "slate-loyalty": {
    title: "Slate loyalty",
    status: "Approved October 20, 2026",
    now: "One loyalty number (0.15); slates sit in a line, and loyalty falls off with each step along it.",
    proposal: "Two settings: how strongly voters prefer their own slate, and how evenly they spread to everyone else. Drop the line. Tune both to overall clustering in real ballots, not to labeled lists.",
    needed: "Nothing for now. Loose or tight becomes a slider in the model tuner, so you can explore it. Default: loose; headline results are run at both ends.",
  },
  popularity: {
    title: "Candidate popularity",
    status: "Approved October 20, 2026 (may change later)",
    now: "One \"popularity spread\" number sets how unequal candidates are. In a 7-candidate field, the current setting (1.0) gives the top candidate about 2.5 times an even split of first choices (real Scottish wards: about 2.1 times), and too few long-shot candidates.",
    proposal: "Set popularity by type of election, as with ballot length: public or organizational, and 1 seat, 2 to 4 seats, or 5 or more seats. Tune the leading candidates to the quota: start each type at the setting where the top candidate's lead over the quota matches real elections (about 0.85 for single-seat public races, 0.6 to 0.7 for most others, and about 0.8 for organizational elections with 5 or more seats). Tune a separate share of long-shot candidates to the last candidate's share of first choices. Check that the model also reproduces the even split and the way bigger fields get more lopsided. Report every headline result across the real range.",
    needed: "Nothing for now. Anything you learn about how lopsided first choices are in your organization, such as past first-choice counts, would replace these defaults.",
  },
  "slate-sizes": {
    title: "Slate sizes",
    status: "Approved October 20, 2026",
    now: "Each slate gets the same share of candidates as of voters.",
    proposal: "Set each slate's share of candidates separately from its share of voters. Your organization's slates run about as many candidates as the seats they expect to win, not full lists, so by default each slate runs candidates in proportion to the seats its support could win, as Scottish parties do.",
    needed: "Nothing for now. A question to test later: is running a slate sized to its expected seats actually better for the slate than running a full list?",
  },
  unaffiliated: {
    title: "Number of slates, and candidates outside slates",
    status: "Approved October 20, 2026",
    now: "4 slates; every candidate belongs to one.",
    proposal: "Keep 4 slates as the default, and add a share of candidates who belong to no slate (about 15%, as in Scotland), who get no loyalty boost from anyone.",
    needed: "Nothing for now. With slates sized to their expected seats, small slates field a single candidate, as in Scotland. The milestone 4 check confirms that the share of candidates with no running mate comes out close to Scotland's (about 64%).",
  },
  "election-size": {
    title: "Election size",
    status: "Approved October 20, 2026",
    now: "10 voters per candidate, at least 1,000; candidates and seats set per run.",
    proposal: "Set candidates, seats, and voters from your organization's real elections, and test a range around them. Lower the 1,000-voter minimum so electorates of a few hundred (Metro DC DSA had 432) can be simulated. Expect about 1.5 to 2 candidates per seat in large elections.",
    needed: "Nothing for now. Candidates, seats, and voters become controls in the model tuner. Default: Metro DC DSA's 2025 delegate election (46 seats, 75 candidates, 432 voters).",
  },
  "quota-rounding": {
    title: "Quota rounding and turnout",
    status: "Needs your decision",
    now: "Each run has one exact number of voters, counted with Scottish rules, whose quota is rounded to a whole number of votes. In elections with few votes per seat, that rounding swings the answer by 2 to 3 times as turnout changes by a few voters.",
    proposal: "Treat turnout as a range, not a number: each simulated election draws its voter count from the range you expect, so the 95% confidence rank already covers not knowing turnout. Count each election both ways, with the whole-vote quota and with the exact quota, until we know which rules your organization uses.",
    needed: "Two things. Which counting rules your organization uses, and in particular whether its quota is a whole number of votes (the rule book or the counting software's settings would say). And the turnout range to plan for, such as the lowest and highest turnout in recent elections.",
  },
};
