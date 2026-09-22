## Purpose

How a published Room artifact's content is stored and read back, so a reader sees
the headings, paragraphs and lists its author wrote, and sees all of its text.

## ADDED Requirements

### Requirement: An artifact published through the command surface keeps the line breaks its author wrote

Where a member publishes artifact content through the Room command surface and that
content carries escaped line breaks, the Room SHALL store it with those breaks as
real line breaks. Content from any other caller MUST be stored unchanged.

#### Scenario: Escaped line breaks from the command surface

- **WHEN** a member publishes an artifact whose content carries escaped line breaks
- **THEN** the stored content carries real line breaks, and each heading is a line of its own

#### Scenario: Content from another caller

- **WHEN** an artifact is published by a caller that is not the command surface
- **THEN** every character is stored unchanged, including a line of prose that quotes the escape

### Requirement: An artifact reads as it was written, and no text is lost

A surface that renders a published artifact's content SHALL show its document
structure, so a heading is shown as a heading and a paragraph as a paragraph. Every
character of the content SHALL appear, whatever headings the document has or does
not have.

#### Scenario: A plan with a document heading and sections

- **WHEN** a plan artifact opens
- **THEN** its first-level heading names the document and each section heading is listed

#### Scenario: A report with section headings only

- **WHEN** an artifact has section headings and no document heading
- **THEN** its sections are shown, and no text before the first heading is dropped

#### Scenario: An artifact with no heading at all

- **WHEN** an artifact has no heading of any kind
- **THEN** all of its content is shown, and it is not shown as empty

#### Scenario: An artifact stored before this requirement

- **WHEN** an artifact whose line breaks were escaped at publication is opened
- **THEN** its structure renders, and the stored file is not rewritten

### Requirement: A Room surface can read an artifact's own content

The Room's own surface SHALL be able to read a published artifact's content without
leaving the page, and the read SHALL be refused for an artifact that does not belong
to that Room.

#### Scenario: Reading a finished Room's artifact

- **WHEN** a Room's page reads an artifact the Room published
- **THEN** it receives the content

#### Scenario: An artifact from another Room

- **WHEN** a read names an artifact that belongs to a different Room
- **THEN** the read is refused and no content is returned

### Requirement: An artifact that cannot be read says so

Where an artifact's content cannot be read — because its reference points outside
the state it is kept in, or because the file is gone — the surface SHALL say the
content cannot be read. It MUST NOT show the artifact as empty.

#### Scenario: A reference that cannot be opened

- **WHEN** an artifact names a reference that cannot be read from here
- **THEN** the surface says the content cannot be read, and the artifact's title, kind and author are still shown
