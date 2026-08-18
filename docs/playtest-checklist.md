# Playtest checklist

Use this checklist when a change affects a playable journey. Mark anything that
does not apply and record the test build, browser, operating system, and input
device with the results.

## Before the session

- [ ] Install from the lockfile and create a fresh production build.
- [ ] Serve the production output from its intended path.
- [ ] Open the browser console and network panel.
- [ ] Start from a clean save or the scenario specified by the issue.

## During the session

- [ ] Complete the affected player journey with keyboard and mouse.
- [ ] Check alternate controls and supported accessibility settings.
- [ ] Confirm loading, pause, restart, checkpoint, and failure flows still work.
- [ ] Watch for visual glitches, collision failures, audio problems, and frame drops.
- [ ] Record reproducible defects without expanding the active issue's scope.

## After the session

- [ ] Confirm there are no unexplained console errors or asset 404s.
- [ ] Capture screenshots or video required by the issue.
- [ ] Record the result, environment, and any follow-up issue links in the pull request.
