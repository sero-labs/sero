## MODIFIED Requirements

### Requirement: A Room's elapsed time counts the time it was active

A Room's elapsed time SHALL be the time the Room has been active, accumulated across every period it ran, plus the period it is running now. It MUST NOT be the wall-clock time since the Room started. Time while the Room is paused or while the execution runtime is closed MUST NOT count. The runtime SHALL bank the open period before a graceful shutdown or pause and SHALL persist a bounded active checkpoint while a Room runs, so an abrupt shutdown cannot leave an open period that spans the whole closed interval. On restart, reconciliation SHALL keep banked time, exclude the known closed interval and label any uncertain final interval instead of inventing an exact figure. The Room's time limit, its list and page summaries and Watch SHALL all use that same accumulated active time.

#### Scenario: A paused Room's clock stops

- **WHEN** a Room runs for twelve minutes, is paused, and is left paused for nine days
- **THEN** its elapsed time still reads twelve minutes, and it has not reached a one-hour time limit

#### Scenario: Resuming continues the count

- **WHEN** that Room is resumed and runs for five more minutes
- **THEN** its elapsed time reads seventeen minutes

#### Scenario: A finished Room holds its figure

- **WHEN** a Room has ended
- **THEN** its elapsed time does not change again

#### Scenario: Closed overnight

- **WHEN** a Room runs for four minutes, its runtime closes for eight hours and it later resumes for one minute
- **THEN** measured active usage is five minutes, not eight hours and five minutes

#### Scenario: Abrupt shutdown

- **WHEN** the last checkpoint cannot establish the exact moment of shutdown
- **THEN** recovery keeps the banked usage up to that checkpoint, marks the interval after it as uncertain and does not count the closed interval

### Requirement: A Room that predates active-time accounting keeps the time it has used

A Room whose record has no accumulated active time SHALL have it set from the time the Room started up to the point accounting begins. The Room MUST NOT be given a fresh time budget, and MUST NOT be reported as having used an unknown amount. Surfaces that show that seeded figure SHALL identify it as recorded before active-time accounting rather than as measured active time. No separate upgrade path SHALL be added for those records.

#### Scenario: An existing paused Room

- **WHEN** a Room that was paused before active-time accounting existed is read afterwards
- **THEN** its elapsed time is the time already recorded against it, that figure stops growing from then on, and the page identifies it as recorded before active-time accounting
