#!/usr/bin/env python3
"""Build the static UX-audit evidence document from the capture register.

Reads register.json, converts every distinct frame to webp under the styleguide
screenshot directory, and writes evidence.html in the style of
apps/styleguide/public/prototypes/sero-design-library-plugin.html.
"""
import html
import json
import os
import shutil
import subprocess
import sys
from collections import Counter, OrderedDict




# --- configuration -----------------------------------------------------------
# Every path comes from the environment so this script is reusable. SHOTS holds
# the raw PNGs and register.json written by the capture spec.
SCRATCH = os.environ["UX_AUDIT_SCRATCH"]
REPO = os.environ["UX_AUDIT_REPO"]
SLUG = os.environ.get("UX_AUDIT_SLUG", "ux-audit")
SHOTS = os.environ.get("UX_AUDIT_SHOTS", f"{SCRATCH}/shots")
OUT_IMG = f"{REPO}/apps/styleguide/public/prototypes/screenshots/{SLUG}"
OUT_DOC = f"{REPO}/apps/styleguide/public/prototypes/{SLUG}"
IMG_BASE = f"../screenshots/{SLUG}"

# Areas and their ledes come from a JSON file you write for this audit. See
# areas.example.json. Keys are the `area` values your capture spec emits.
_areas = json.load(open(f"{SCRATCH}/areas.json"))
AREA_ORDER = list(_areas.keys())
AREA_TITLE = {k: v["title"] for k, v in _areas.items()}
AREA_LEDE = {k: v.get("lede", "") for k, v in _areas.items()}

# Authored observations, keyed by an id prefix, or by a "-substring-" that names
# a sub-view. The longest, most specific match wins. Write these yourself after
# looking at the frames: this is the audit, and it cannot be generated.
NOTES = json.load(open(f"{SCRATCH}/notes.json"))

def note_for(row):
    """A key starting with "-" names a sub-view and is the most specific match.
    Otherwise the longest matching id prefix wins."""
    best, best_rank = "", -1
    for key in NOTES:
        if key.startswith("-"):
            rank = 2 if key in row["id"] else 0
        else:
            rank = 1 if row["id"].startswith(key) else 0
        if rank == 0:
            continue
        if (rank, len(key)) > (best_rank, len(best)):
            best, best_rank = key, rank
    return NOTES[best] if best else None


def convert(src, dst):
    tmp = "/tmp/_uxaudit_resize.png"
    subprocess.run(["sips", "-Z", "1600", src, "--out", tmp],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["cwebp", "-q", "72", "-quiet", tmp, "-o", dst], check=True)


def esc(value):
    return html.escape(value or "", quote=True)


def main():
    register = json.load(open(f"{SHOTS}/register.json"))
    rows = register["rows"]
    # Start clean: a frame that is no longer in the register must not stay
    # published under an id the document never mentions.
    shutil.rmtree(OUT_IMG, ignore_errors=True)
    os.makedirs(OUT_IMG, exist_ok=True)
    os.makedirs(OUT_DOC, exist_ok=True)

    captured = [r for r in rows if r["status"] == "captured"]
    duplicates = [r for r in rows if r["status"] == "duplicate"]
    gaps = [r for r in rows if r["status"] == "gap"]

    made = {}
    for row in captured:
        src = os.path.join(SHOTS, row["file"])
        if not os.path.exists(src):
            row["status"] = "gap"
            row["reason"] = "The capture file is missing from this run."
            continue
        name = row["id"] + ".webp"
        convert(src, os.path.join(OUT_IMG, name))
        made[row["id"]] = name
    captured = [r for r in captured if r["id"] in made]

    by_area = OrderedDict((a, []) for a in AREA_ORDER)
    for row in captured:
        by_area.setdefault(row["area"], []).append(row)

    meta = json.load(open(f"{SCRATCH}/intro.json"))
    parts = [HEAD.replace("__TITLE__", esc(meta["title"]))]
    parts.append(intro(captured, duplicates, gaps))

    counter = 0
    for area, items in by_area.items():
        if not items:
            continue
        parts.append(
            f'<section class="area"><h2 class="area-title">{esc(AREA_TITLE.get(area, area))}'
            f'<span>{len(items)} frames</span></h2>'
            f'<p class="area-lede">{AREA_LEDE.get(area, "")}</p></section>'
        )
        for row in items:
            counter += 1
            observed = note_for(row)
            note = (f'<p class="note"><span class="tag">Observed</span>{esc(observed)}</p>'
                    if observed else
                    f'<p class="note"><span class="tag quiet">Task</span>{esc(row["task"])}</p>')
            parts.append(
                '<section class="state">'
                f'<h3>{counter} · {esc(row["page"])}</h3>'
                f'<p class="sub">{esc(row["state"])}<span class="rid">{esc(row["id"])}</span></p>'
                f'{note}'
                f'<div class="frame"><img loading="lazy" src="{IMG_BASE}/{esc(made[row["id"]])}" '
                f'alt="{esc(row["page"])} — {esc(row["state"])}" width="{row.get("width") or 1600}"></div>'
                '</section>'
            )

    parts.append(gap_table(gaps, duplicates))
    parts.append(FOOT.replace("__FOOTER__", meta["footer"]))
    with open(f"{OUT_DOC}/evidence.html", "w") as handle:
        handle.write("\n".join(parts))
    print(f"captured {len(captured)} · duplicate {len(duplicates)} · gaps {len(gaps)}")
    print(f"wrote {OUT_DOC}/evidence.html")
    total = sum(os.path.getsize(os.path.join(OUT_IMG, f)) for f in os.listdir(OUT_IMG))
    print(f"images {total/1e6:.1f} MB")


def intro(captured, duplicates, gaps):
    """Title and lede paragraphs come from intro.json, which you write.

    The ledes must state the capture provenance and its limits honestly: how
    the frames were taken, which on-screen artefacts are side effects of the
    capture mode rather than product defects, and what the set cannot show.
    """
    meta = json.load(open(f"{SCRATCH}/intro.json"))
    per_area = Counter(r["area"] for r in captured)
    cells = "".join(
        f'<div class="stat"><b>{per_area.get(a, 0)}</b><span>{esc(AREA_TITLE[a])}</span></div>'
        for a in AREA_ORDER
    )
    ledes = "".join(f'<p class="lede">{p}</p>' for p in meta["ledes"])
    return f'''
<div class="intro">
  <h1>{esc(meta["title"])}</h1>
  {ledes}
  <div class="stats">{cells}
    <div class="stat"><b>{len(duplicates)}</b><span>Duplicate frames, not republished</span></div>
    <div class="stat"><b>{len(gaps)}</b><span>Gaps, each with a reason</span></div>
  </div>
</div>'''


def gap_table(gaps, duplicates):
    grouped = {}
    for row in gaps:
        grouped.setdefault(row["reason"], []).append(row)
    body = []
    for reason, items in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
        ids = ", ".join(sorted(r["id"] for r in items)[:6])
        more = f" and {len(items) - 6} more" if len(items) > 6 else ""
        body.append(
            f'<tr><td class="count">{len(items)}</td><td>{esc(reason)}</td>'
            f'<td class="ids">{esc(ids)}{esc(more)}</td></tr>'
        )
    dup = (f'<p class="area-lede">{len(duplicates)} further entries reached their state but rendered a frame '
           'already held, so they are recorded without a second image.</p>') if duplicates else ""
    return f'''
<section class="area"><h2 class="area-title">Gaps<span>{len(gaps)} entries</span></h2>
<p class="area-lede">A state that could not be reached stays visible here with its reason. Coverage is
<b>partial</b> while these remain.</p>{dup}
<table class="gaps"><thead><tr><th>Count</th><th>Reason</th><th>Register ids</th></tr></thead>
<tbody>{"".join(body)}</tbody></table></section>'''


HEAD = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
:root{
  --bg:#09090b;--surface:#111113;--raised:#18181b;--line:#26262b;--line-strong:#393940;
  --text:#f4f4f5;--text-2:#b7b7c0;--text-3:#74747f;
  --emerald:#34d399;--emerald-2:#10b981;--emerald-wash:rgba(52,211,153,.1);
  --amber:#fbbf24;--red:#fb7185;
  --sans:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace;
}
*{box-sizing:border-box}
html{background:#050506;color-scheme:dark}
body{margin:0;padding:60px 24px 120px;background:#050506;color:var(--text);font-family:var(--sans)}
h1,h2,h3,p{margin:0}
.doc{width:min(1400px,100%);margin:0 auto}
.intro{max-width:820px;margin-bottom:56px}
h1{font-size:28px;line-height:1.15;letter-spacing:-.04em;font-weight:650}
.lede{margin-top:13px;color:var(--text-2);font-size:15px;line-height:1.65}
.lede b{color:var(--text);font-weight:560}
code{font:12px var(--mono);color:var(--emerald);background:var(--raised);padding:1px 5px;border-radius:4px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.stat{flex:1 1 150px;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.stat b{display:block;font-size:22px;font-weight:600;letter-spacing:-.02em}
.stat span{display:block;margin-top:3px;color:var(--text-3);font-size:11px;line-height:1.4}
.area{margin:72px 0 0}
.area-title{display:flex;align-items:baseline;gap:12px;font-size:20px;letter-spacing:-.02em;font-weight:620;
  padding-bottom:10px;border-bottom:1px solid var(--line-strong)}
.area-title span{margin-left:auto;color:var(--text-3);font:10px var(--mono);letter-spacing:.08em;text-transform:uppercase}
.area-lede{max-width:820px;margin-top:12px;color:var(--text-2);font-size:13px;line-height:1.6}
.area-lede b{color:var(--text)}
.state{margin-top:44px}
h3{font-size:16px;line-height:1.2;letter-spacing:-.02em;font-weight:600}
.sub{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-top:5px;color:var(--text-3);font-size:12px}
.rid{margin-left:auto;font:10px var(--mono);color:#55555e}
.note{max-width:900px;margin:10px 0 14px;color:var(--text-2);font-size:13px;line-height:1.55}
.tag{display:inline-block;margin-right:8px;padding:2px 6px;border-radius:4px;background:var(--emerald-wash);
  color:var(--emerald);font:9px var(--mono);letter-spacing:.08em;text-transform:uppercase;vertical-align:1px}
.tag.quiet{background:var(--raised);color:var(--text-3)}
.frame{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--bg);
  box-shadow:0 20px 60px rgba(0,0,0,.4)}
.frame img{display:block;width:100%;height:auto}
table.gaps{width:100%;margin-top:18px;border-collapse:collapse;font-size:12px}
table.gaps th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line-strong);
  color:var(--text-3);font:10px var(--mono);letter-spacing:.08em;text-transform:uppercase;font-weight:400}
table.gaps td{padding:9px 10px;border-bottom:1px solid var(--line);color:var(--text-2);vertical-align:top}
table.gaps td.count{width:52px;font:12px var(--mono);color:var(--amber)}
table.gaps td.ids{font:10px var(--mono);color:var(--text-3)}
footer{margin-top:80px;padding-top:20px;border-top:1px solid var(--line);color:var(--text-3);font-size:12px;line-height:1.6}
</style>
</head>
<body>
<main class="doc">'''

FOOT = '''<footer>
__FOOTER__
</footer>
</main>
</body>
</html>'''


if __name__ == "__main__":
    sys.exit(main())
