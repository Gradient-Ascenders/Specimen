# Beta, trailer, submission, and mentor requirements

This document separates requirements confirmed by the supplied CGV project
brief from current-year details that still need Moodle or mentor evidence. The
brief says that year-specific dates, submission links, group information,
mentor allocation, and demonstration venues are published on Moodle, and that
Moodle takes precedence.

The brief was supplied for the Issue #6 verification task and reviewed on
19 August 2026. A copy is not checked into this repository, so a teammate must
cross-check this interpretation against the shared brief and record that review
on the pull request. The project team directly confirmed on 19 August 2026 that
Beta is due on 1 September 2026. No exact cutoff time, venue, Moodle link, Moodle
screenshot, or written mentor confirmation is currently provided.

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

## Current-year information status

Planning dates or workflows in this table are not requirements. Confirm them on
Moodle; Moodle dates and current-year instructions override this plan.

| Requirement/question | Status | Confirmed answer | Source/evidence | Owner / next action |
| --- | --- | --- | --- | --- |
| What is the Beta due date? | Confirmed | Beta is due on 1 September 2026. | Direct project-team confirmation, recorded 19 August 2026 | Team: plan delivery against 1 September 2026. Replace this evidence note with the Moodle notice if it is later published. |
| What are the exact Beta cutoff time and venue? | Not currently provided | Cannot be determined from the information currently available. | No current-year Moodle instruction is provided. | Team: follow any later Moodle instruction; until then, do not invent a time or venue. |
| What is the exact Moodle submission link? | Not currently provided | Cannot be determined from the information currently available. | The general brief delegates submission links to Moodle; no current-year link is provided. | Team: record the Moodle activity/link if it is later published, without copying credentials. |
| What is the current-year archive naming convention? | Not currently provided | Cannot be determined. `specimen-production.zip` is the repository's local artifact name, not a confirmed submission filename. | Repository archive script; no current-year Moodle naming instruction is provided. | Release owner: retain the local name unless a later Moodle instruction requires another name. |
| Must an additional hosted URL/link specifically be submitted at Beta? | Not currently provided | Cannot be determined. The brief confirms LAMP deployment for Final, not a Beta hosted-link requirement. | Supplied CGV project brief; no current-year Moodle instruction is provided. | Team: do not treat a Beta hosted URL as required unless later instructions say so. |
| Where exactly is the YouTube trailer link submitted, and are there current-year encode, visibility, or metadata rules? | Not currently provided | Cannot be determined beyond the confirmed YouTube destination and 2-minute maximum. | Supplied CGV project brief; no current-year Moodle instruction is provided. | Team: follow any later trailer-submission instruction without inventing extra requirements. |
| Is there a prescribed Beta demonstration duration? | Not currently provided | Cannot be determined from the information currently available. | The brief describes the demonstration but gives no duration in the supplied evidence. | Team: do not claim a prescribed duration unless later instructions provide one. |
| Is there a required demonstration order or content beyond showing the project and answering questions? | Not currently provided | Cannot be determined from the information currently available. | The brief confirms only the general demonstration and questions described above. | Team: prepare from the confirmed brief and follow any later Moodle instruction. |
| Has the team's mentor allocation or any special mentor instruction been confirmed? | Not currently provided | Cannot be determined from the information currently available. | The brief delegates mentor allocation to Moodle and only gives the general lab-session advice above. | Team: use the confirmed general mentor guidance and record any later allocation or instruction. |
| Does the mentor expect additional evidence, screenshots, or video beyond the normal demonstration? | Not currently provided | Cannot be determined from the information currently available. | No such requirement appears in the supplied brief or Issue #6. | Team: do not invent an additional evidence requirement; record it only if later provided. |

## Source conflicts and downstream use

- Issue #6 records 31 August as tentative planning information. The project
  team's later direct confirmation sets the Beta due date to 1 September 2026,
  superseding that assumption.
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
| Capture links/screenshots or written mentor confirmation | NOT CURRENTLY AVAILABLE — accepted for issue closure | No Moodle link/screenshot or mentor response is currently provided. This absence is explicit rather than replaced with an assumption. |
| Have another member verify the interpretation | Pending pull-request review | PR review remains required before merge, independently of Issue #6 closure. |
| Update the project plan with confirmed dates and deliverables | PASS | No project-plan file exists, so this focused requirements record now documents the confirmed 1 September 2026 due date and deliverables. |
| Record remaining ambiguity without silently inventing dates | PASS | The unresolved table states each exact question and next action. |
| Acceptance criteria are satisfied | ACCEPTED FOR CLOSURE BY TEAM | The due date is confirmed, and every detail that cannot currently be determined is explicitly recorded as unavailable. |
| Production build succeeds | PASS | `npm run build` passed on 19 August 2026. Vite repeated the existing warning that the JavaScript chunk exceeds 500 kB. |
| No new unexplained console errors or asset 404s are introduced | PASS — documentation scope | No runtime, asset, or deployment-output file changed. Published-host checks remain part of the later release workflow. |
| Relevant manual verification is complete | Pending pull-request review | A second team member still needs to compare this record with the shared brief before merge. |
| Required screenshots/video/evidence are attached for visual work | PASS — not applicable | This change has no visual or runtime effect. Moodle/mentor evidence remains separately blocked above. |
| Resource disposal/performance implications have been considered | PASS — documentation scope | No runtime resources or performance paths changed. |
| Third-party assets/code/resources are recorded in the credits ledger | PASS — not applicable | No third-party asset, code, or resource was introduced. |
| Another team member reviews the pull request | Pending pull-request review | Required before merge. |
| Issue is linked from the pull request | PASS | PR #61 uses `Refs #6`. |
| Follow-up defects or deferred scope are recorded | PASS | Remaining requirements work is explicitly listed above rather than added to implementation scope. |

The project team accepted the explicitly unavailable current-year details and
authorised Issue #6 for closure on 19 August 2026. Pull-request review remains a
separate prerequisite for merging this documentation.
