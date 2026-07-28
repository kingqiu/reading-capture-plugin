# Creation Workflow visual baseline

- Approved reference viewport: `1105 × 768`.
- `01`–`08` PNG files are regenerated from the frozen final HTML with its stage query parameters.
- `09-detach-impact-dialog.jpeg` is the approved unlink-impact dialog.
- `baseline-manifest.json` protects the approved assets with SHA-256 fingerprints.
- `superseded/` contains early screenshots that predate the final entry and platform-flow decisions; they are not references.
- `actual-2026-07-20/` contains the earlier real Obsidian captures with application chrome. They remain historical evidence and are not used as the final content-viewport comparison.
- `content-only-reference/` contains a second, non-destructive export of the frozen prototype with only its 50 px fake Obsidian header removed. The original approved `01`–`08` files and their manifest are unchanged.
- `content-viewport-reference/` contains the top `1105 × 681` portion visible inside the calibrated real Obsidian content viewport.
- `actual-content-captures/content-viewport/` contains the corresponding real Obsidian captures at 100% application zoom, with the real ribbon and application chrome removed.
- `visual-comparison/` contains reference/actual/amplified-difference triptychs and `metrics.json` for all eight stages.

The real captures intentionally use the existing project and its persisted artifacts. Consequently, exact text, counts, active delivery branch, completed-state labels, and document contents differ from the illustrative prototype fixture. The comparison is valid for shell geometry, hierarchy, control distinction, overflow, and responsive behavior; its raw pixel score is not an acceptance threshold for fixture-dependent content.

Run a strict comparison with the bundled workspace Python runtime:

```text
python3 scripts/compare-creation-screenshots.py \
  --reference docs/personal-creation-workflow/baseline \
  --actual <content-only-1105x768-capture-directory> \
  --output output/creation-workflow-visual-diff
```

The report records dimensions, normalized mean absolute error, changed-pixel ratio, and an amplified diff image per stage. Product text and real project data must be normalized in the capture fixture before treating a pixel score as an acceptance result. The 2026-07-20 fixed-viewport report therefore records the scores as diagnostic evidence only; it does not mislabel dynamic-content differences as failed styling.
