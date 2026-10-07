# Playtesting

Use this checklist for changes that affect a playable journey. Record the
revision/build, browser, operating system, input device, route, and result in
the relevant issue or pull request.

## Before

- [ ] Install from the lockfile and create a fresh production build or archive.
- [ ] Serve the built output over HTTP at its intended path.
- [ ] Start from the requested save/checkpoint state.
- [ ] Open Console and Network; enable diagnostics with `?debug=1` and F2 when
      the test needs lifecycle or renderer data.

## During

- [ ] Complete the affected route with keyboard and mouse.
- [ ] Exercise pause/resume, restart, death/Retry, checkpoints, and transitions.
- [ ] Test alternate ordering, slime switching, inactive-body interactions, and
      obstruction/failure states relevant to the change.
- [ ] Check supported viewport sizes and accessibility/settings behavior.
- [ ] Watch for collision faults, softlocks, unclear feedback, visual/audio
      regressions, long stalls, and unstable resource counts.

## After

- [ ] Confirm no unexplained console error, WebGL error, failed request, or 404.
- [ ] Repeat the route after restart without reloading the page.
- [ ] Record reproducible defects separately from the change under review.
- [ ] Attach only the minimal screenshots, video, traces, logs, and measurements
      needed for review. Keep local output under ignored `artifacts/`; use CI,
      issue, or pull-request attachments for shared evidence.

Automated smoke tests establish basic correctness, not visual approval,
real-hardware performance, accessibility, or a complete playthrough.
