---
name: sero-humanize
description: |
  Audit or edit Sero Markdown documentation and other product prose to remove
  AI-writing patterns while preserving technical meaning, product terminology,
  links, examples, and the repository voice. Use when the user asks to humanize,
  de-slop, tighten, simplify, rewrite, or audit Sero documentation, README text,
  UI copy, release notes, plans, or specifications for AI tells. Also use when
  prose needs ASD-STE100 Simplified Technical English. Do not use for code review
  or for creative and promotional writing.
---

# Sero Humanize

Make Sero prose direct, specific, and useful. Human writing in technical
documentation does not need personality. It needs clear decisions, concrete
facts, and respect for the reader's time.

## Follow the requested mode

- For an audit or review, report the material patterns and do not edit files.
- For an edit, rewrite the named files in place.
- For a new document, apply these rules while drafting it.
- If the request does not specify a mode, infer it from the requested action.
  Do not turn a request to assess prose into permission to change it.

## Establish the voice and preservation set

Before editing:

1. Read every file in scope in full.
2. Read the nearest repository instructions that apply to those files.
3. Use adjacent, clearly human-edited Sero documentation as the voice sample
   when the named files do not establish a consistent voice.
4. Record what must not change:
   - technical meaning and product behaviour;
   - product names, canonical terms, and exact UI labels;
   - commands, code, file paths, numbers, limits, and factual claims;
   - frontmatter, anchors, link targets, image paths, and screenshot order;
   - quotations and user input examples, unless the user asks to edit them.

Identify the intended reader. Unless the page states otherwise, assume the
reader knows neither Sero nor the feature. Do not assume that simpler grammar
fixes an explanation that requires missing product knowledge.

Do not add a fact to make a sentence more vivid. Verify a doubtful claim from
the repository or leave it unchanged and report the doubt.

## Audit structure before wording

Look for clusters and repeated patterns. Do not treat one punctuation mark or
one common word as proof of AI writing.

Prioritize these defects:

- Meta narration that announces the next explanation instead of giving it.
- Repeated tutorial staging such as "what you are about to learn" and "what you
  have learned."
- Fixed enumerations such as "three things are worth noticing" when a direct
  heading or short list is clearer.
- Several paragraphs that can change order without changing the argument.
- A heading followed by a sentence that only repeats the heading.
- A conclusion that repeats the introduction without adding an action or fact.
- Repeated summaries of the same screen, process, or result.
- Forced contrasts such as "not only X, but Y" or "not X; rather Y."
- Groups of three used for rhythm instead of meaning.
- Mechanical bold lead-ins, excessive inline bold, or lists that should be
  short prose.
- Promotional adjectives, vague importance claims, and unsupported praise.
- Vague actors, passive constructions, filler, stacked hedges, and abstract
  nouns where an action is available.
- Synonym cycling for one product concept. Repeat the canonical term.
- Long sentences that mix instructions, exceptions, and background.
- Em dashes used repeatedly to join thoughts that need separate sentences.
- Headings that narrate the demo or expose implementation language instead of
  naming the reader's task, such as "The finish" or "Answer the gate."
- Examples that depend on an unexplained demo domain and therefore do not help
  the reader understand the feature.
- Tutorials that start using the product before they give prerequisites,
  sample data, expected starting state, or required sign-ins.
- Result sections that recite one captured run instead of telling the reader
  what to inspect and verify.

Keep useful structure. A list, summary, warning, question heading, or em dash is
not a defect by itself.

## Rewrite for Sero documentation

Apply ASD-STE100 Simplified Technical English where it fits the material:

- Put the action or answer first.
- Use active voice when the actor matters.
- Give one main instruction per sentence.
- Put a condition before the action when the reader must know it first.
- Prefer common, precise words over formal or promotional alternatives.
- Use the same term for the same thing.
- Keep paragraphs focused on one subject.
- Keep necessary limits, cautions, and exceptions close to the action.
- Use contractions only when the established local voice requires them.
- Keep exact UI text in bold when the documentation uses bold for controls.
- Keep code identifiers and paths in code formatting.
- Retain a summary only when it helps the reader decide or act.

For an overview page:

- Explain the feature in familiar words before using its product terms.
- State what the user gives Sero, what Sero does, and what the user reviews.
- When comparing features, give one plain decision rule. Use examples that a
  reader can understand without knowing the tutorial repository or a specialist
  software domain.

For a tutorial:

- Put setup before the first product action. Include required software,
  accounts, sign-ins, repository or sample-data setup, and a command or visible
  result that confirms the expected starting state.
- Prefer a stable sample repository over instructions that ask an agent to
  generate approximate sample data. Verify the repository contents and commands
  before documenting them.
- Use task-based headings such as "Review the plan," "Change the plan," and
  "Check the result." A heading must describe the full purpose of its section;
  do not narrow a general control to one example case.
- End with checks the reader can perform. Do not use a captured run's cost,
  duration, names, or outcome as a substitute for verification instructions.

For feature language:

- Use the visible object name: icon, button, tab, question, or approval request.
  Do not call an icon a mark or expose internal terms such as gate, fan-out, or
  feedback route when plain behaviour is enough.
- Keep exact UI labels unchanged, but explain them with common words.
- Put high-value quality-of-life features where readers will find them. Give
  them enough space to explain when the control appears, how to use it, what it
  changes, and what remains under user control.

Compress or merge material freely when meaning and navigation remain intact.
Do not preserve the original paragraph boundaries merely because they exist.

Do not manufacture a human voice with:

- anecdotes, opinions, jokes, sensory details, or personal asides;
- fragments, one-word sentences, or dramatic punch lines;
- arbitrary sentence-length variation;
- unusual synonyms chosen only to make wording less predictable;
- metaphors that replace a precise technical explanation;
- deliberate imperfections or tangents;
- an invented AI probability or numerical slop score.

## Preserve Markdown and product accuracy

- Do not change fenced code, commands, URLs, link targets, image targets, or
  frontmatter unless the request requires it.
- Do not rename a heading if another page links to its generated anchor without
  updating that link.
- Do not change a UI label to improve prose. Rewrite the surrounding sentence.
- Do not remove repetition that is required for independent reference sections.
- Do not convert a walkthrough into reference documentation, or reference
  documentation into a narrative tutorial, without user approval.
- Do not infer product behaviour from the prose alone when the edit changes a
  technical claim. Check the implementation or an authoritative reference.
- Treat contradictions between prose, screenshots, capture metadata, sample
  repositories, and implementation as accuracy defects. Resolve them from the
  authoritative source instead of rewriting around them.
- When a page title changes, update the sidebar, index, related-page labels, and
  in-scope links that display the old title.

## Use a two-pass edit

### Pass 1: structure

Remove redundant framing, merge repeated explanations, order information by the
reader's task, and keep prerequisites before dependent actions. Give prominent
placement to features that materially improve repeated use; do not give every
feature equal weight merely because the source page did.

### Pass 2: sentences

Remove filler and AI mannerisms. Simplify grammar. Keep terminology and facts
stable. Read the result as technical documentation, not as marketing copy.

Then compare the result with the preservation set. Correct any lost condition,
changed claim, broken reference, altered example, or mismatched UI label.

## Validate edited files

Run checks that match the change:

1. Inspect the diff for accidental changes to code blocks, links, images,
   examples, numbers, and UI labels.
2. Search for renamed heading anchors and update in-scope references when the
   rename was intentional.
3. If the tutorial uses a sample repository, verify its URL, files, commands,
   expected failures, and required authentication.
4. Run `git diff --check`.
5. Run documentation build or link checks when the change can affect rendering
   or navigation and the repository provides a focused command.
6. State exactly what was checked and what was not checked.

Report the main structural changes. Do not paste the full rewritten document
unless the user asks for it.

## Example

Before:

> Three things in that description are worth noticing, because each one becomes
> a part of the plan you will see in a moment.

After:

> The description controls three parts of the plan:

The revision keeps the useful relationship and removes the tutorial
announcement. If the count is not useful, remove it too and lead with the first
instruction.
