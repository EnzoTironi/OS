# Zoen final program

`program.json` is the canonical source for 52 implementation units, eight canonical journeys, and nine final gates. `frontier.json` records GitHub facts that affect the program. `ledger.tsv` records exact-head verification verdicts.

Run this command after changing `program.json`, `frontier.json`, or `ledger.tsv`:

```sh
node orchestrate/zoen-final/render-status.mjs --write
```

Commit the resulting `status.md`, `units.tsv`, `dependencies.tsv`, `journeys.tsv`, and `final-gates.tsv`. CI and reviewers can run the command without `--write` to reject stale generated files.

The reports directory contains historical evidence. A report does not override the current program source.
