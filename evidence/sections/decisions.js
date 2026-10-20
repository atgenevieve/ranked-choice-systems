// The model decisions, shown on the overview tab and at the top of each tab.
// Keep in step with docs/model-review.md.
const DECISIONS = {
  "ballot-length": {
    title: "Ballot length",
    status: "Waiting on the owner",
    now: "Every simulated voter ranks every candidate, up to a cap of 100.",
    proposal: "Two settings. Electorate type (public voters, tuned to Scotland, or organization members, tuned to the union and society elections) sets how far each voter naturally ranks; it grows with the number of candidates, and much less with seats. Ballot rules set a maximum (none, equal to the seats, or another number) and an optional minimum instruction. Voters rank their own slate first, then continue to their natural length. A maximum cuts ballots and can pull voters up to it; a minimum pulls most voters up to it.",
    needed: "Approve the two-setting structure. The exact wording of your ballot: \"up to N\", \"at least N\", or \"exactly N\".",
  },
  "slate-loyalty": {
    title: "Slate loyalty",
    status: "Waiting on the owner",
    now: "One loyalty number (0.15); slates sit in a line, and loyalty falls off with each step along it.",
    proposal: "Two settings: how strongly voters prefer their own slate, and how evenly they spread to everyone else. Drop the line. Tune both to overall clustering in real ballots, not to labeled lists.",
    needed: "Approve. Are your organization's slates loose (like Portland's endorsement slates, about 10 to 15 points above popularity) or tight (like Scottish parties, about 60 above)?",
  },
  popularity: {
    title: "Candidate popularity",
    status: "Waiting on the owner",
    now: "Each candidate's popularity is drawn from a lognormal distribution with spread 1.0.",
    proposal: "Keep the lognormal for serious candidates, at a spread of about 0.7, and add a separate share of long-shot candidates drawn from a much lower range. Report every headline result across the real range of spreads (about 0.6 to 1.6).",
    needed: "Approve. Anything you know about how lopsided first choices are in your organization.",
  },
  "slate-sizes": {
    title: "Slate sizes",
    status: "Waiting on the owner",
    now: "Each slate gets the same share of candidates as of voters.",
    proposal: "Set each slate's share of candidates separately from its share of voters. By default, big slates run fewer candidates than their support would suggest, as Scottish parties do.",
    needed: "Approve. Do your organization's big slates run full lists or short ones?",
  },
  unaffiliated: {
    title: "Number of slates, and candidates outside slates",
    status: "Waiting on the owner",
    now: "4 slates; every candidate belongs to one.",
    proposal: "Keep 4 slates as the default, and add a share of candidates who belong to no slate (about 15%, as in Scotland), who get no loyalty boost from anyone.",
    needed: "Approve. How many organized slates your elections usually have.",
  },
  "election-size": {
    title: "Election size",
    status: "Waiting on the owner",
    now: "10 voters per candidate, at least 1,000; candidates and seats set per run.",
    proposal: "Set candidates, seats, and voters from your organization's real elections, and test a range around them.",
    needed: "Typical numbers of candidates, seats, and voters in your organization's elections.",
  },
};
