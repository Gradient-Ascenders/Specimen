# Beta, trailer, submission, and mentor requirements

This document separates requirements confirmed by the supplied CGV project
brief from current-year details that still need Moodle or mentor evidence. The
brief says that year-specific dates, submission links, group information,
mentor allocation, and demonstration venues are published on Moodle, and that
Moodle takes precedence.

The brief was supplied for the Issue #6 verification task and reviewed on
19 August 2026. A copy is not checked into this repository, so a teammate must
cross-check this interpretation against the shared brief and record that review
on the pull request. No Moodle screenshot/link or written mentor confirmation
was available during this audit.

## Confirmed by the CGV project brief

| Requirement/question | Status | Confirmed answer | Source/evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| Is Beta assessed? | Confirmed | Beta is a graded assessment. | Supplied CGV project brief, reviewed 19 August 2026 | Team: plan Beta as an assessment gate. |
| What happens at Beta? | Confirmed | Demonstrate the project in action and answer questions about design choices, effects, implementation, and related work. | Supplied CGV project brief, reviewed 19 August 2026 | Team: prepare an honest demonstration and technical explanations. |
| Must every bug and level be finished at Beta? | Confirmed | Minor bugs are acceptable. One or two levels may remain incomplete if the project is fundamentally finished and close to production. | Supplied CGV project brief, reviewed 19 August 2026 | Team: record known limitations; do not treat this allowance as permission to submit an unfinished core project. |
| Is the trailer part of Beta? | Confirmed | Yes. The trailer is included at Beta. | Supplied CGV project brief, reviewed 19 August 2026 | Issue #46 owner: include the trailer in the Beta release plan. |
| Is a devlog required at Beta? | Confirmed | No. The devlog is required only for Final. | Supplied CGV project brief, reviewed 19 August 2026 | Team: keep Final devlog work separate from the Beta gate. |
| What is the trailer duration and public destination? | Confirmed | The trailer must be no longer than 2 minutes and must be uploaded to YouTube. | Supplied CGV project brief, reviewed 19 August 2026 | Issue #46 owner: verify the final duration and YouTube playback. The current-year link-submission workflow remains unresolved below. |
| Where is the Final build deployed? | Confirmed | The Final build is deployed to the department LAMP server. | Supplied CGV project brief, reviewed 19 August 2026 | Release owner: use the Moodle-controlled process below; do not infer that SSH/SCP access is available. |
| How is deployment submitted? | Confirmed | Deployment uses a Moodle archive upload, not SSH/SCP. Upload a production build rather than the source tree. | Supplied CGV project brief, reviewed 19 August 2026 | Release owner: obtain the current Moodle link and naming rules before upload. |
| What is the Vite archive layout? | Confirmed | Build `dist/`, then archive the contents of `dist/` so `index.html` is at the archive root. Do not wrap the files in an extra `dist/` directory. | Supplied CGV project brief; repository `package.json`, `vite.config.ts`, archive script, and production deployment guide | Release owner: run `npm run archive` and inspect the ZIP before upload. |
| How must the build be tested? | Confirmed | Serve the built files over local HTTP before upload. Open and play the published version in Chrome. | Supplied CGV project brief; `docs/production-deployment.md` | Release owner: retain local and published-host evidence. |
| What hosting constraints apply? | Confirmed | Deployment must work from a subdirectory; root-absolute asset paths beginning with `/` are unsafe. Linux filenames are case-sensitive. | Supplied CGV project brief; repository `vite.config.ts` uses `base: './'` | Contributors: preserve relative paths and exact filename casing. |
| How should the team use its mentor? | Confirmed | Approach the assigned mentor during lab sessions with questions and request advice. | Supplied CGV project brief, reviewed 19 August 2026 | Issue #6 owner: take the mentor questions below to a lab session and record written answers/date. |

## Current-year questions still open

Planning dates or workflows in this table are not requirements. Confirm them on
Moodle; Moodle dates and current-year instructions override this plan.

| Requirement/question | Status | Confirmed answer | Source/evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| What is the exact Beta date, time, and venue shown on Moodle? | Needs Moodle confirmation | Unresolved. `~31 August 2026` is a tentative planning assumption only. | Issue #6 mentions the tentative date; no Moodle evidence is recorded. | Issue #6 owner: attach or link the current Moodle notice and record its access date. |
| What is the exact Moodle submission deadline? | Needs Moodle confirmation | Unresolved. | The general brief delegates year-specific dates to Moodle; no Moodle evidence is recorded. | Issue #6 owner: capture the deadline and timezone from Moodle. |
| What is the exact Moodle submission link? | Needs Moodle confirmation | Unresolved. | The general brief delegates submission links to Moodle; no Moodle evidence is recorded. | Issue #6 owner: record the current-year Moodle activity/link without copying credentials. |
| What is the current-year archive naming convention? | Needs Moodle confirmation | Unresolved. `specimen-production.zip` is the repository's local artifact name, not a confirmed submission filename. | Repository archive script; no Moodle naming instruction is recorded. | Issue #6 owner: copy the exact Moodle filename rule into this table. Release owner: rename only when confirmed. |
| Must an additional hosted URL/link specifically be submitted at Beta? | Needs Moodle confirmation | Unresolved. The brief confirms LAMP deployment for Final, not a Beta hosted-link requirement. | Supplied CGV project brief; no Moodle evidence is recorded. | Issue #6 owner: ask where, if anywhere, a Beta hosted URL must be submitted. |
| Where exactly is the YouTube trailer link submitted, and are there current-year encode, visibility, or metadata rules? | Needs Moodle confirmation | Unresolved beyond the confirmed YouTube destination and 2-minute maximum. | Supplied CGV project brief; no current-year Moodle evidence is recorded. | Issue #6 owner: capture the complete current-year trailer submission instructions from Moodle. |
| Is there a prescribed Beta demonstration duration? | Needs Moodle confirmation | Unresolved. | The brief describes the demonstration but gives no duration in the supplied evidence. | Issue #6 owner: check Moodle and record the exact duration or an explicit statement that none is prescribed. |
| Is there a required demonstration order or content beyond showing the project and answering questions? | Needs Moodle confirmation | Unresolved. | The brief confirms only the general demonstration and questions described above. | Issue #6 owner: check the current-year Moodle demonstration instructions. |
| Has the team's mentor allocation or any special mentor instruction been confirmed? | Needs mentor confirmation | Unresolved. | The brief delegates mentor allocation to Moodle and only gives the general lab-session advice above. | Issue #6 owner: confirm the assigned mentor on Moodle, ask during a lab, and record the answer and date. |
| Does the mentor expect additional evidence, screenshots, or video beyond the normal demonstration? | Needs mentor confirmation | Unresolved. | No such requirement appears in the supplied brief or Issue #6. | Issue #6 owner: ask the assigned mentor and record a written answer/date; do not create an evidence requirement by assumption. |

## Source conflicts and downstream use

- Issue #6 asks the team to resolve the tentative 31 August date, but supplies no
  Moodle evidence. The date therefore remains tentative.
- The previous production guide said Issue #6 contained no confirmed publish
  answers. The supplied brief does confirm Final LAMP deployment through a Moodle
  archive upload, while the exact current-year Moodle link, deadline, filename,
  and any Beta hosted-link requirement remain unresolved.
- Issue #46 may rely on the confirmed 2-minute maximum, YouTube destination, and
  inclusion at Beta. It must not infer the current-year link-submission workflow.
- Issue #47 may rely on the confirmed production-build and archive-layout rules.
  Its wording about a published Beta URL is a delivery plan, not evidence that a
  hosted URL is specifically required for Beta.

## Issue #6 acceptance assessment

| Criterion | Result | Evidence / remaining action |
| --- | --- | --- |
| Each open brief question has an answer, owner, or escalation path | PASS | Every known confirmed and unresolved item is assigned above. |
| Conflicts between sources are recorded | PASS | The tentative date, prior deployment-guide wording, and downstream hosted-URL assumption are recorded above. |
| Release and trailer issues can use confirmed requirements | PASS | Confirmed trailer, build, archive, host, and browser constraints are separated from current-year questions. |
| Capture links/screenshots or written mentor confirmation | BLOCKED — needs Moodle confirmation / mentor confirmation | No Moodle evidence or mentor response was available. Attach/link it when obtained. |
| Have another member verify the interpretation | BLOCKED — needs teammate review | A non-author must cross-check the shared brief and review the pull request. |
| Update the project plan with confirmed dates and deliverables | BLOCKED — needs Moodle confirmation | No project-plan file exists and no exact date is confirmed. This focused requirements record documents the confirmed deliverables and tentative date without inventing a calendar fact. |
| Record remaining ambiguity without silently inventing dates | PASS | The unresolved table states each exact question and next action. |
| Acceptance criteria are satisfied | BLOCKED — needs Moodle confirmation / mentor confirmation / teammate review | The evidence and independent-review criteria above remain open. |
| Production build succeeds | PASS | `npm run build` passed on 19 August 2026. Vite repeated the existing warning that the JavaScript chunk exceeds 500 kB. |
| No new unexplained console errors or asset 404s are introduced | PASS — documentation scope | No runtime, asset, or deployment-output file changed. Published-host checks remain part of the later release workflow. |
| Relevant manual verification is complete | BLOCKED — needs teammate review | A second team member still needs to compare this record with the shared brief. |
| Required screenshots/video/evidence are attached for visual work | PASS — not applicable | This change has no visual or runtime effect. Moodle/mentor evidence remains separately blocked above. |
| Resource disposal/performance implications have been considered | PASS — documentation scope | No runtime resources or performance paths changed. |
| Third-party assets/code/resources are recorded in the credits ledger | PASS — not applicable | No third-party asset, code, or resource was introduced. |
| Another team member reviews the pull request | BLOCKED — needs teammate review | Required after the pull request is opened. |
| Issue is linked from the pull request | Pending PR | Use `Refs #6` while Moodle, mentor, and teammate verification remain open. |
| Follow-up defects or deferred scope are recorded | PASS | Remaining requirements work is explicitly listed above rather than added to implementation scope. |

Issue #6 cannot be closed until the blocked evidence and teammate-review items
are completed and the exact current-year requirements are recorded.
