## Purpose

How a Workflow's reflection pass turns its own run history into durable lessons and
suggested changes, so its lessons stay a set of distinct facts rather than repeats
of one fact.

## ADDED Requirements

### Requirement: Reflection holds only distinct lessons

A Workflow's reflection pass SHALL receive the lessons the Workflow already holds,
and SHALL add only a lesson the Workflow does not already hold. The comparison
SHALL be the reflecting model's, made from the lessons it is given, and MUST NOT be
made by matching one lesson's text against another's. Suggestions are unaffected:
they keep their own status and their rejected list.

#### Scenario: A repeated lesson

- **WHEN** a reflection pass returns a lesson that states what the Workflow's existing lessons already state
- **THEN** no lesson is added, and the lessons already held are unchanged

#### Scenario: A new lesson

- **WHEN** a reflection pass returns a lesson the Workflow does not already hold
- **THEN** the lesson is added, and the lessons already held are unchanged

#### Scenario: The existing lessons reach the model

- **WHEN** a reflection pass runs for a Workflow that holds lessons
- **THEN** those lessons are given to the model with the run history

#### Scenario: A Workflow with no lessons

- **WHEN** a reflection pass runs for a Workflow that holds no lessons
- **THEN** every valid lesson it returns is added
