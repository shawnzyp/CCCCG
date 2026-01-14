# Asset Cleanup Utilities

## Unused Asset Scanner

The `tools/scan-unused-assets.mjs` script scans JavaScript, CSS, HTML, image, and font files, then searches the repository for references to each file name. Files with zero references are reported and optionally deleted after confirmation.

### Requirements

- ripgrep (`rg`) must be installed and available on your `PATH`.

### Usage

```bash
node tools/scan-unused-assets.mjs
```

Optional: pass a root directory (defaults to the current working directory):

```bash
node tools/scan-unused-assets.mjs /path/to/repo
```

### Reports

Reports are written to the `reports/` directory:

- `reports/unused-assets.json`
- `reports/unused-assets.txt`

### Deletion Confirmation

For each zero-hit file, the script prompts:

```
No references found for <file>. Delete? [y/N]
```

Only explicit `y`/`yes` responses delete files. In non-interactive environments, deletions are skipped.

### Flags

- `--strict`: only count matches for the relative path (no basename matching).
- `--report-only`: never delete files (default behavior).
- `--delete`: enable deletion prompts for zero-hit files.
- `--yes`: delete all zero-hit files without prompting (requires `--delete`).
