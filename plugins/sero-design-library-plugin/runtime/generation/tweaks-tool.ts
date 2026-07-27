import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

import type { EmittedFile } from '../../shared/targets';
import { MAX_TWEAK_CONTROLS, MAX_TWEAK_OPTIONS } from '../../shared/tweaks';
import type { TweakValidation } from '../../shared/tweaks-validate';
import { validateTweakControls } from '../../shared/tweaks-validate';

/**
 * How a run declares the controls for the page it just wrote (spec §6.5).
 *
 * Declared through a tool for the same reason the files are: the runtime, not the
 * reply, decides what a revision has. A manifest mentioned in prose is a
 * description of controls; a manifest declared here is checked against the code
 * that was actually emitted, and what fails the check is dropped before the panel
 * ever renders it.
 *
 * The checking happens *in the call*, not after the run, so the model is told
 * immediately that `--display-scale` is not in its own stylesheet. It can then
 * either add the property to the page or drop the control — both are fixes, and
 * neither is available once the run is over.
 *
 * That first answer is feedback, not the verdict. What the tool keeps is the raw
 * declaration, and `result()` re-checks it against the files *as they now stand*
 * — because a run can declare its controls and then rewrite the stylesheet out
 * from under them. Validating once, at declaration time, would let a page ship a
 * control for a property it no longer has, and bake that property into the
 * preview's allow-list: exactly the inert control this tool exists to prevent.
 *
 * Every value crosses as a string. A union of string, number and boolean is
 * exactly the kind of schema that different providers render differently, and a
 * CSS value is a string at the far end regardless; ranges are the one case that
 * needs numbers, and they get them through `min`, `max` and `step`.
 */

export interface DeclareTweaksTool {
  definition: ToolDefinition;
  /**
   * The last declaration, validated against the emitted files at the moment you
   * ask — null when the tool was never called.
   */
  result(): TweakValidation | null;
}

const CONTROL_TYPES = ['range', 'toggle', 'colour', 'choice'] as const;

export function createDeclareTweaksTool(files: () => EmittedFile[]): DeclareTweaksTool {
  let declared: unknown[] | null = null;

  const sourceOf = () =>
    files()
      .map((file) => file.content)
      .join('\n');

  // The revision id is stamped on when the revision is stored; at this point it
  // does not exist yet, and inventing one here would let a manifest claim to
  // belong to a revision that was never written.
  const validate = (entries: unknown[]) => validateTweakControls(entries, sourceOf(), '');

  const definition: ToolDefinition = {
    name: 'design_library_declare_tweaks',
    label: 'Declare Design Tweaks',
    description: `Declares the live controls for the page you just wrote. Call it once, after every file is written. Each control must bind to a CSS custom property your page both declares and reads through \`var()\` — anything else is dropped, because a control that changes nothing on screen is worse than no control. Choose what is worth adjusting on *this* page (at most ${MAX_TWEAK_CONTROLS}); do not emit a standard set.`,
    promptSnippet:
      'design_library_declare_tweaks — declares the live CSS controls for the page you wrote',
    parameters: Type.Object({
      controls: Type.Array(
        Type.Object({
          id: Type.String({ description: 'Stable identifier, e.g. `display-scale`' }),
          group: Type.String({ description: 'Section heading, e.g. `Typography`' }),
          label: Type.String({ description: 'What the user sees, e.g. `Display scale`' }),
          cssVariable: Type.String({
            description: 'The custom property this control sets, e.g. `--display-scale`',
          }),
          type: StringEnum(CONTROL_TYPES, { description: 'Which kind of control to render' }),
          defaultValue: Type.String({
            description:
              'The value the page ships with. For `range`, the number without its unit.',
          }),
          min: Type.Optional(Type.Number({ description: '`range` only' })),
          max: Type.Optional(Type.Number({ description: '`range` only' })),
          step: Type.Optional(Type.Number({ description: '`range` only' })),
          unit: Type.Optional(
            Type.String({ description: '`range` only, e.g. `px`, `rem`, `em`, `deg`' }),
          ),
          onValue: Type.Optional(Type.String({ description: '`toggle` only — the value when on' })),
          offValue: Type.Optional(
            Type.String({ description: '`toggle` only — the value when off' }),
          ),
          options: Type.Optional(
            Type.Array(Type.Object({ label: Type.String(), value: Type.String() }), {
              description: `\`choice\` only — 2 to ${MAX_TWEAK_OPTIONS} options`,
            }),
          ),
        }),
        { description: 'The controls that matter for this page' },
      ),
    }),
    async execute(_toolCallId, params) {
      const { controls } = params as { controls: unknown[] };

      if (sourceOf() === '') {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No files have been written yet, so there is no page to bind controls to. Write the design first with `design_library_write_file`, then declare its controls.',
            },
          ],
          details: { ok: false },
          isError: true,
        };
      }

      declared = controls.map(toDefinitionShape);
      const answer = validate(declared);

      const kept = answer.manifest.controls.length;
      const lines = [`Accepted ${kept} control${kept === 1 ? '' : 's'}.`];
      if (answer.dropped.length > 0) {
        lines.push(
          `Dropped ${answer.dropped.length}:`,
          ...answer.dropped.map((entry) => `- ${entry.label}: ${entry.reason}`),
          'Fix these by declaring and using the property in the page, or leave them out and call this tool again with the controls that work.',
        );
      }
      lines.push(
        'These are checked again against the finished page, so a later rewrite that removes a property also removes its control.',
      );
      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: { ok: kept > 0, accepted: kept, dropped: answer.dropped.length },
        isError: false,
      };
    },
  };

  return { definition, result: () => (declared === null ? null : validate(declared)) };
}

/**
 * The flat wire shape back into the nested definition the domain uses. Flat
 * because a discriminated union of four control shapes is the part of a tool
 * schema that providers render least consistently — and getting it wrong costs
 * the whole declaration.
 */
function toDefinitionShape(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null) return entry;
  const value = entry as Record<string, unknown>;
  return {
    id: value.id,
    group: value.group,
    label: value.label,
    cssVariable: value.cssVariable,
    defaultValue: value.defaultValue,
    control: {
      type: value.type,
      ...(value.min === undefined ? {} : { min: value.min }),
      ...(value.max === undefined ? {} : { max: value.max }),
      ...(value.step === undefined ? {} : { step: value.step }),
      ...(value.unit === undefined ? {} : { unit: value.unit }),
      ...(value.onValue === undefined ? {} : { onValue: value.onValue }),
      ...(value.offValue === undefined ? {} : { offValue: value.offValue }),
      ...(value.options === undefined ? {} : { options: value.options }),
    },
  };
}
