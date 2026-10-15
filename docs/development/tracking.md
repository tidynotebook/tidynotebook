# Work tracking

This page states where the open work of the product lives and how a row is
shaped.

## The board is the one list

The [GitHub project board](https://github.com/users/bkhanale/projects/2) is the
single prioritized list of open work. The owner orders the rows. A row near the
top is more important than a row below it.

The board replaces the release lists that this repository used to hold. It
holds no release list now. See
[0027, track work on the GitHub board](../decisions/0027-track-work-on-the-github-board.md).

## The shape of a row

Each row on the board is a GitHub issue. Each issue carries three fields:

- A milestone, which names the release that the work ships in.
- A priority label, which sets the order of the work.
- An area label, which names the part of the product that the work touches.

The issue body states the problem and the evidence. It points at code by path.
It does not copy source.

## Context

Use an issue to state the problem and link related work.
Designs and plans are optional aids for larger changes.
The development process is in [AGENTS.md](../../AGENTS.md).
