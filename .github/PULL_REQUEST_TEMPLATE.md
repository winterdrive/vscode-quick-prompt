## Summary

<!-- Briefly describe what changed and why. -->

## Pre-flight Check

- Open PRs / active branches checked:
- Overlap assessment:
- Routine PR: yes / no

## Changes

- 

## Safety Verification

- [ ] `npx tsc -p ./`
- [ ] `npm run test`
- [ ] `npm run test:coverage`
- [ ] Other:

## Routine PR Notes

For daily routine Draft PRs:

- Do not bump `package.json` or `package-lock.json`.
- Do not update `CHANGELOG.md`.
- Do not modify MCP tool schemas, names, or parameters under `mcp-server/src/tools/`.
- Package version bump and changelog consolidation are deferred to the weekend release/integration PR.
- If GitHub Actions fails only because of the release version gate, treat that as release-readiness behavior, not a code validation failure.

## Release Readiness

- [ ] This PR is labeled `release-ready` only when version and changelog updates are intentionally included.
