# Open source readiness

Status: active

The [GitHub project board](https://github.com/users/bkhanale/projects/2) holds
the order and priority. This plan applies the existing license and launch
decision to the findings of the
[audit](../audits/2026-10-11/open-source-readiness.md) and the later
[public material review](../audits/2026-10-11/public-material-review.md).
The [control guide](../development/open-source-launch.md) gives the launch
checks and readback commands. The design is
[design 024](../design/024-tidy-notebook-cloud-and-self-hosted.md).

## Decisions

- [0188. The repository opens under AGPL-3.0-only](../decisions/0188-the-repository-opens-under-agpl-3-0-only.md)
- [0186. The open core holds no billing](../decisions/0186-the-open-core-holds-no-billing-and-a-private-service-sells-the-cloud.md)
- [0027. Track work on the GitHub board](../decisions/0027-track-work-on-the-github-board.md)
- [0212. Agent lifecycle uses exact input proof](../decisions/0212-agent-lifecycle-proof.md)

## Ordered work

Each issue has the launch milestone, a priority label and an area label. A
completed local change still needs proof and landing. A new boundary or gate
policy needs a decision record before its implementation.

| Item | Issue                                                          | Result                                                                                                            | State                                                                             |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1    | [315](https://github.com/tidynotebook/tidynotebook/issues/315) | Correct the public setup and current documents. Add community files and configuration tests.                      | Complete. PR 322 lands the proved source and image.                               |
| 2    | [316](https://github.com/tidynotebook/tidynotebook/issues/316) | Close or resolve each dependency finding under the version policy.                                                | Complete. PR 323 lands the fixes and refusal tests with no dependency advisories. |
| 3    | [317](https://github.com/tidynotebook/tidynotebook/issues/317) | Retain the required notices in source and shipped output. Prove the actual shipped license graph and source path. | Open.                                                                             |
| 4    | [318](https://github.com/tidynotebook/tidynotebook/issues/318) | Review history, images, comments, logs, archives and release material for public use.                             | Retained-material review is complete. Its audit and proof still need landing.     |
| 5    | [319](https://github.com/tidynotebook/tidynotebook/issues/319) | Set and read back the public GitHub controls and contributor access path.                                         | CI, alerts and security fixes are enabled and read back. Public controls remain.  |
| 6    | [320](https://github.com/tidynotebook/tidynotebook/issues/320) | Prove a fresh standalone checkout, final source, image and self-hosted setup.                                     | Open for the final candidate.                                                     |
| 7    | [284](https://github.com/tidynotebook/tidynotebook/issues/284) | Perform the accepted public launch after all dependencies pass.                                                   | Existing launch issue. Requires its release, deployment and visibility scope.     |

## Checklist

### Rights and source

- [x] The accepted decision selects AGPL-3.0-only and states existing ownership.
- [x] The root license, manifests and contracts agree.
- [x] The DCO check proves the outside contribution rule.
- [ ] Required copied and bundled notices reach each distributed artifact.
- [ ] The shipped license graph has a recorded compatibility and source review.
- [ ] Each public image maps to accessible corresponding source and build inputs.
- [x] The owner accepts a separate core package for future compliant images.
- [ ] The image policy uses that package and keeps the old package private and intact.

### Community and setup

- [x] README, contribution guide, changelog and security policy exist.
- [x] The code of conduct, issue templates and PR template are present.
- [x] The maintainer role and a direct private report contact are stated.
- [x] The account, save, key and image descriptions are correct.
- [x] Regression tests prove the quick start and image CI Compose settings.
- [x] The changed guide pages have light and dark evidence in PR 322.
- [x] The contribution and setup changes land.
- [ ] A fresh clone with no private consumer completes the self-hosted setup.

### Security and public material

- [x] An all-ref secret scan is checked against historical source.
- [x] An issue, PR and issue-comment text scan is checked.
- [x] Compatible dependency fixes remove the high-severity findings in this branch.
- [x] The remaining transitive advisories have fixes and refusal tests in PR 323.
- [x] PR review comments, available attachments, screenshots and old logs are reviewed.
- [x] The retained material follows the accepted ownership and intact-history decisions.
- [ ] The final source, image and release assets pass a fresh secret review.

### GitHub and launch

- [x] Workflow actions use full commit pins and default token access is read-only.
- [x] The DCO target job uses only the base script.
- [ ] Public branch controls fit the accepted landing path and refuse force pushes.
- [ ] Dependency alerts, secret protection and private reporting are enabled and read back where available.
- [x] The issue path and owner administrator access are checked without exposing cloud work.
- [ ] The source and image gates pass for the exact final candidate.
- [ ] GitHub checks pass for that head, including the image and performance jobs.
- [ ] The owner starts the launch under record 0188 and issue 284.
- [ ] An unauthenticated reader can get the public source, guide and image.

## Close an item

Save proof in the lifecycle context. Name the exact commit, the relevant
tests, the artifact and any remaining input. Keep raw scanner output private.
Update the issue and this plan when its result changes. Do not close an item
because a file exists when its required behavior has not been checked.
