# Git UX — manual test script

Six checks, about 15 minutes. Everything here has automated coverage **except the
model's own output**, so test 3 is the one that matters most.

Each step says what you should see. If something differs, that's the finding.

---

## Setup

Make a throwaway repo with a real merge conflict in it. Copy the whole block:

```bash
rm -rf ~/Desktop/sero-git-test
mkdir -p ~/Desktop/sero-git-test && cd ~/Desktop/sero-git-test
git init -q . && git config user.email you@example.com && git config user.name "You"

printf 'export const precision = 2;\n\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n\nexport const currency = "GBP";\n' > settings.ts
printf '# Notes\n\nFirst line.\n' > NOTES.md
git add . && git commit -qm "initial commit"

git switch -qc feature
printf 'export const precision = 4;\n\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n\nexport const currency = "USD";\n' > settings.ts
printf '# Notes\n\nFirst line.\n\nAdded on the feature branch.\n' > NOTES.md
git commit -qam "raise precision, switch to USD, add a note"

git switch -q main
printf 'export const precision = 3;\n\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n// ---\n\nexport const currency = "EUR";\n' > settings.ts
git commit -qam "nudge precision, switch to EUR"
git merge feature
```

The last line **is meant to fail** with "Automatic merge failed" — that's the fixture.

You now have `settings.ts` with two separate conflicts (precision and currency),
and `NOTES.md` which merged cleanly.

Then start Sero from the repo root:

```bash
SERO_DEV_PLUGINS=git pnpm dev
```

Add `~/Desktop/sero-git-test` as a workspace and open the **Git** app.

---

## 1. The merge is announced (1 min)

1. Look at the top of the Git app.

**You should see:** a red banner — "Merging feature in. 1 of 1 conflicted file
still needs you" — carrying **Abort merge** and a violet **✨ Resolve with AI**.

2. Look at the file list in the middle column.

**You should see:** `settings.ts` under **Conflicts**, and `NOTES.md` under
**Merged cleanly**. Not one flat list.

3. Look at the buttons.

**You should see:** Fetch, Pull and Push greyed out. The green button says
**Conclude merge**, is greyed out, and has "1 conflict left to resolve"
underneath it.

> There should be **no** `LIVE` badge and **no** Refresh button in the top bar.

---

## 2. Resolving by hand still works (2 min)

The AI is an offer, not a replacement — check the manual path first.

1. Click `settings.ts` in the file list.

**You should see:** the right pane shows the file with both sides, labelled
**current** and **incoming**, and buttons above each conflict: *Accept current
change*, *Accept incoming change*, *Accept both*.

2. Don't click them yet. In the terminal, in the test repo, run:

   ```bash
   git merge --abort && git merge feature
   ```

**You should see:** the app return to normal on its own, then back into the merge
banner, without you touching anything in the app.

*(That's also test 6, done early and free.)*

---

## 3. Resolve with AI — the important one (5 min)

1. Click **✨ Resolve with AI** in the banner.

**You should see:** the right pane become a running list. One line per conflict,
each saying what it did and why, in plain words. **Pause** and **Stop** top right.

2. Wait for it to finish or stop for a question.

**You should see** one of two things, both fine:
- It resolves both conflicts and the banner turns to "Every conflict is
  resolved".
- It stops on the currency one and asks a question with the real options —
  something like `EUR (current · main)` and `USD (incoming)` as buttons.

3. **This is the judgement call.** Read what it wrote:
   - Are the reasons on each line true and useful, or vague filler?
   - If it asked a question, is it one you'd genuinely want to be asked, or
     should it have just decided?
   - If it decided everything, was it right to? Open `settings.ts` and check.

4. Click a file it resolved.

**You should see:** the resolved content, no `<<<<<<<` markers left.

**What to report:** anything where it bluffed a confident answer to something
ambiguous, or asked about something obvious.

---

## 4. Undo AI resolutions (2 min)

Only if test 3 resolved something.

1. Click **Undo AI resolutions** in the banner.

**You should see:** the files it resolved go back to conflicted, the banner
count return, and **Conclude merge** grey out again. If you answered a question
in test 3, **your answer should survive** — only the machine's work is undone.

2. Check the file in the terminal: `grep -c '<<<<<<<' ~/Desktop/sero-git-test/settings.ts`

**You should see:** a count above 0, matching what the app claims.

---

## 5. The commit message sparkle (3 min)

1. Finish the merge however you like (AI, by hand, or `git merge --abort` and
   `git merge feature` again then accept incoming everywhere) until
   **Conclude merge** is available. Conclude it.

2. Edit a file — change `precision` to `10` and save.

3. Stage **only that file** in the Git app, then click the **✨** inside the
   commit message box.

**You should see:** it spin in place, then a message appear describing that
change. No pop-ups.

4. Now edit `NOTES.md` too, leave it **unstaged**, and click ✨ again.

**You should see:** a message about the staged change only — the Git app commits
what's staged, so the message must not mention `NOTES.md`.

5. Open the **branch button in the top-right corner of the window** (not the Git
   app) and click the ✨ in *its* message box.

**You should see:** a message covering **both** files — that panel commits
everything it lists.

**What to report:** a message describing changes the button wouldn't actually
commit. That's the failure that matters here.

---

## 6. It keeps itself up to date (2 min)

Already partly covered in test 2, but worth doing deliberately.

1. Leave the Git app open and visible.
2. In the terminal, in the test repo: `echo "// from the terminal" >> settings.ts`
3. Don't touch the app.

**You should see:** `settings.ts` appear in the changed list within a second or
two, by itself.

4. Also try `git switch -qc scratch` in the terminal.

**You should see:** the branch name in the app change on its own.

**What to report:** anything that needs you to click into and out of the app to
show up. There's no Refresh button any more — the app is supposed to keep up.

---

## Optional: the dashboard widgets (1 min)

Open the dashboard and look at the two Git widgets.

**You should see:** counts as plain text — `↑2 ↓1`, `12 commits` — not inside
coloured pills. A branch that's level with its remote should say **nothing**
about being in sync.

---

## Cleaning up

```bash
rm -rf ~/Desktop/sero-git-test
```

Then remove the workspace from Sero's sidebar.
