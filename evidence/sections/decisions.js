// The model decisions, shown on the overview tab and at the top of each tab.
// Keep in step with docs/model-review.md.
const DECISIONS = {
  "ballot-length": {
    title: "Ballot length",
    status: "Approved October 20, 2026",
    now: "Every simulated voter ranks every candidate, up to a cap of 100.",
    proposal: "Two settings. Electorate type (public voters, tuned to Scotland, or organization members, tuned to the union and society elections) sets how far each voter naturally ranks; it grows with the number of candidates, and much less with seats. Ballot rules set a maximum (none, equal to the seats, or another number) and an optional minimum instruction. Voters rank their own slate first, then continue to their natural length. A maximum cuts ballots and can pull voters up to it; a minimum pulls most voters up to it.",
    needed: "Still open: the exact wording of your ballot: \"up to N\", \"at least N\", or \"exactly N\".",
  },
  "slate-loyalty": {
    title: "Slate loyalty",
    status: "Approved October 20, 2026",
    now: "One loyalty number (0.15); slates sit in a line, and loyalty falls off with each step along it.",
    proposal: "Two settings: how strongly voters prefer their own slate, and how evenly they spread to everyone else. Drop the line. Tune both to overall clustering in real ballots, not to labeled lists.",
    needed: "Still open: whether your organization's slates are loose (like Portland's endorsement slates) or tight (like Scottish parties). Until your organization's ballots show which, test both.",
  },
  popularity: {
    title: "Candidate popularity",
    status: "Waiting on the owner",
    now: "One \"popularity spread\" number sets how unequal candidates are. In a 7-candidate field, the current setting (1.0) gives the top candidate about 2.5 times an even split of first choices (real Scottish wards: about 2.1 times), and too few long-shot candidates.",
    proposal: "Tune the leading candidates so the top one gets about 2 times an even split of first choices, as in a typical Scottish ward or union election (a spread of about 0.7). Add a separate share of long-shot candidates far below the rest: in most real wards, the last candidate gets under 3% of first choices. Report every headline result across the real range, from about 1.5 to 3 times an even split.",
    needed: "Approve. Anything you know about how lopsided first choices are in your organization.",
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
    needed: "Typical numbers of candidates, seats, and voters in your organization's elections, when you have them.",
  },
};
