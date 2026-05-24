# Browser-pack platform agent prompt

Use this prompt for each native platform agent that will build and publish one Sero host browser-pack artifact.

---

You are building one Sero browser-pack release artifact on the native machine you are currently running on.

## Goal

Build the browser pack for this machine's OS/CPU, upload both generated files to the GitHub Release, and report back the exact information needed to merge browser-pack metadata.

Required release targets only:

| Platform machine | Expected archive | Expected receipt JSON |
| --- | --- | --- |
| macOS Apple Silicon / arm64 | `mac-arm64.tar.gz` | `mac-arm64.json` |
| Linux x64 | `linux-x64.tar.gz` | `linux-x64.json` |
| Linux arm64 | `linux-arm64.tar.gz` | `linux-arm64.json` |
| Windows x64 using Git Bash/MSYS | `win-x64.tar.gz` | `win-x64.json` |

Do **not** build Intel Mac/macOS x64; it is unsupported. Do not build Windows arm64 for the beta support matrix; it remains a possible future target.

## Important constraints

- Work on branch `<release-branch>`.
- Browser-pack builds must run on the matching native OS/arch. Do not cross-build.
- On Windows, run from Git Bash/MSYS, not PowerShell.
- Upload artifacts to GitHub Release tag `<browser-pack-release-tag>` in `sero-labs/sero`.
- Do not commit generated files under `apps/desktop/dist/browser-pack/`.
- Do not edit source unless a build script bug prevents completion; if that happens, stop and report the issue.

## Steps

### 1. Confirm machine and repo state

```bash
uname -a
node --version
pnpm --version
gh auth status
git status --short --branch
```

If this is Windows, also confirm Git Bash/MSYS:

```bash
uname -s
```

Expected Windows output starts with `MINGW`, `MSYS`, or `CYGWIN`.

### 2. Prepare checkout

If the repo is not already checked out:

```bash
git clone git@github.com:sero-labs/sero.git
cd sero
```

Then:

```bash
git checkout <release-branch>
git pull --ff-only
pnpm install --frozen-lockfile
```

### 3. Build this machine's browser pack

```bash
pnpm --filter @sero/desktop browser-pack:build -- \
  --metadata-out dist/browser-pack/<browser-pack-version>
```

The build should create exactly one archive and one small JSON receipt under:

```txt
apps/desktop/dist/browser-pack/<browser-pack-version>/
```

Examples:

```txt
apps/desktop/dist/browser-pack/<browser-pack-version>/linux-x64.tar.gz
apps/desktop/dist/browser-pack/<browser-pack-version>/linux-x64.json
```

### 4. Upload both files

Upload the archive and its matching JSON receipt to the release.

Use the pair produced for your current machine.

macOS Apple Silicon:

```bash
gh release upload <browser-pack-release-tag> \
  apps/desktop/dist/browser-pack/<browser-pack-version>/mac-arm64.tar.gz \
  apps/desktop/dist/browser-pack/<browser-pack-version>/mac-arm64.json \
  --repo sero-labs/sero \
  --clobber
```

Linux x64:

```bash
gh release upload <browser-pack-release-tag> \
  apps/desktop/dist/browser-pack/<browser-pack-version>/linux-x64.tar.gz \
  apps/desktop/dist/browser-pack/<browser-pack-version>/linux-x64.json \
  --repo sero-labs/sero \
  --clobber
```

Linux arm64:

```bash
gh release upload <browser-pack-release-tag> \
  apps/desktop/dist/browser-pack/<browser-pack-version>/linux-arm64.tar.gz \
  apps/desktop/dist/browser-pack/<browser-pack-version>/linux-arm64.json \
  --repo sero-labs/sero \
  --clobber
```

Windows x64 from Git Bash/MSYS:

```bash
gh release upload <browser-pack-release-tag> \
  apps/desktop/dist/browser-pack/<browser-pack-version>/win-x64.tar.gz \
  apps/desktop/dist/browser-pack/<browser-pack-version>/win-x64.json \
  --repo sero-labs/sero \
  --clobber
```

### 5. Verify upload exists

Replace `<archive>` and `<json>` with your two filenames:

```bash
gh release view <browser-pack-release-tag> \
  --repo sero-labs/sero \
  --json assets \
  --jq '.assets[].name' | grep -E '^(<archive>|<json>)$'
```

### 6. Report back

Reply with this exact report format:

```txt
Browser-pack build report
Platform machine: <macOS arm64 | Linux x64 | Linux arm64 | Windows x64 Git Bash>
Git commit built: <git rev-parse HEAD>
Archive uploaded: <filename.tar.gz>
Receipt JSON uploaded: <filename.json>
Archive URL: https://github.com/sero-labs/sero/releases/download/<browser-pack-release-tag>/<filename.tar.gz>
Receipt JSON URL: https://github.com/sero-labs/sero/releases/download/<browser-pack-release-tag>/<filename.json>
Receipt JSON contents:
<copy the full contents of the generated .json receipt here>
Build command exit status: <passed/failed>
Upload command exit status: <passed/failed>
Notes/blockers: <none or details>
```

The receipt JSON contents are important. They contain the checksum and file size needed to update Sero's committed browser-pack metadata.

## If anything fails

Stop and report:

- the exact command that failed
- the full error message
- OS/arch from `uname -a`
- `git rev-parse HEAD`
- whether the archive or JSON receipt was created
- whether either file was uploaded
