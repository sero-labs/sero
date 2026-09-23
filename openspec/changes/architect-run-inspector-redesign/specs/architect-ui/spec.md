## ADDED Requirements

### Requirement: The inspector follows the approved prototype

The Run inspector SHALL match the Run inspector view of `apps/styleguide/public/prototypes/architect-run-observability/` in order, grouping and control placement: the header row (Project, run title, Scope, Live), one row of summary tiles, the counter line, the filter row, the timeline beside the selected-activity panel, the three charts and the status legend. Panels that share a row SHALL share its height, and each panel's content area SHALL grow to fill that height, so the layout leaves no blank band between or inside panels. At narrow widths the selected-activity panel and the charts SHALL stack below the timeline as the prototype's 960 px frame shows. The inspector MUST NOT add explanatory sentences, keyboard hint strips or sub-headings inside the selected-activity panel. Each figure SHALL carry only a short label and, where it adds a fact, a short value line such as a clock range or a wait breakdown.

#### Scenario: Compare with the prototype

- **WHEN** the built inspector and the prototype are captured at 1240 px and 960 px with the same run selected
- **THEN** each region appears in the same order and position, with the prototype's help sentences absent

#### Scenario: Few rows beside a tall detail panel

- **WHEN** a filter leaves three timeline rows while the selected-activity panel shows model and token detail
- **THEN** the timeline panel is as tall as the detail panel, its tree area fills that height, and the charts start directly below both with no blank band between

#### Scenario: Charts in one row

- **WHEN** the three charts sit in one row and one chart has less content than the others
- **THEN** each chart's plot area grows to the row height, so no panel ends in blank space below its legend

#### Scenario: Live toggle

- **WHEN** the selected run is open and the user presses **Live**
- **THEN** the control reads **Paused** and the inspector stops re-reading the run until the user presses it again
