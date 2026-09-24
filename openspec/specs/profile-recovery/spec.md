## Purpose

Lets a user reach profiles that still exist on disk when the registry no longer
lists them, and keeps those profiles when the registry is broken, so a registry
reset never strands real data.

## Requirements

### Requirement: Discover profiles that exist outside the registry

The system SHALL find profile directories that exist on disk but are not
registered. It SHALL scan the managed profiles directory under the Sero root,
SHALL offer the Sero root itself when that directory holds profile data, and
SHALL read the newest `profiles.broken-<timestamp>.json` backup beside
`profiles.json`. A discovery result SHALL carry an id, a name, an absolute path,
and a last-modified time for each entry, and SHALL carry recorded folder
ownership and onboarding state when the backup provides them. The system SHALL
return each profile at most once, even when two sources match it.

#### Scenario: Directories under the managed root are found

- **WHEN** the registry is empty and `~/.sero-ui/profiles/` contains two
  directories that each look like a profile
- **THEN** discovery returns both with their directory names as names

#### Scenario: Recorded identity is preferred over the directory scan

- **WHEN** the newest broken backup records a profile named "Studio" with id
  `abc` at a path that still exists
- **THEN** discovery returns that profile with name "Studio" and id `abc`

#### Scenario: A recorded path outside the managed root is offered

- **WHEN** the newest broken backup records a profile at a custom path outside
  `~/.sero-ui/profiles/` and that directory still exists
- **THEN** discovery returns the profile at that recorded path

#### Scenario: A recorded profile whose directory is gone is not offered

- **WHEN** the newest broken backup records a profile whose path no longer
  exists
- **THEN** discovery does not return that profile

#### Scenario: A directory that is not a profile is not offered

- **WHEN** the managed root contains a directory with no readable profile files
- **THEN** discovery does not return it

#### Scenario: A profile found by both sources is returned once

- **WHEN** a directory under the managed root and an entry in the newest broken
  backup resolve to the same path
- **THEN** discovery returns one entry for that path

#### Scenario: The default-root profile is found

- **WHEN** the registry is empty, no usable backup exists, and the Sero root
  itself holds profile data
- **THEN** discovery offers the profile at the Sero root

#### Scenario: A fresh installation is not offered

- **WHEN** the Sero root holds no profile data
- **THEN** discovery does not offer the Sero root as a profile

#### Scenario: Recorded ownership is carried

- **WHEN** the newest broken backup records a profile whose folder ownership is
  `custom`
- **THEN** discovery reports that ownership rather than deriving one from the
  folder's location

### Requirement: Adopt a discovered profile at its existing path

The system SHALL adopt a discovered profile by registering it at the path it
already occupies and SHALL make it the active profile. Adoption SHALL NOT copy,
move, or rewrite profile data. Adopting a path that is already registered, or a
path where discovery finds no recoverable profile, SHALL fail with an error
instead of creating a duplicate entry. Adoption SHALL take identity and folder
ownership from discovery and SHALL NOT infer ownership from the path: a folder
that no record describes SHALL keep unknown ownership and SHALL NOT become
eligible for permanent deletion.

#### Scenario: Ownership is not inferred from location

- **WHEN** a profile is adopted from a directory under the managed profiles root
  that no record describes
- **THEN** it keeps unknown ownership and is not eligible for permanent deletion

#### Scenario: Recorded ownership is preserved

- **WHEN** a broken-registry backup records a profile in a folder marked
  `custom`
- **THEN** adoption keeps `custom`, and the folder stays ineligible for
  permanent deletion even under the managed profiles root

#### Scenario: No recoverable profile at the path

- **WHEN** the user adopts a path where discovery finds no recoverable profile
- **THEN** adoption fails with an error and the registry is unchanged

#### Scenario: Adopting makes the profile active

- **WHEN** the user adopts a discovered profile
- **THEN** the profile appears in the registry at its existing path with
  `activeProfileId` set to it

#### Scenario: Adopted data is unchanged

- **WHEN** a profile directory is adopted
- **THEN** its agent config, credentials, and layout files are the same
  afterwards as before

#### Scenario: An already registered path is rejected

- **WHEN** the user adopts a path that a registered profile already owns
- **THEN** adoption fails with an error and the registry is unchanged

### Requirement: First-run setup offers discovered profiles

When no profile is registered and discovery finds profiles, the first-run setup
screen SHALL list them above the create-profile form, showing name, path, and
when each was last modified, with an action to open one. Creating a new profile
SHALL remain available on the same screen. When discovery finds nothing, the
screen SHALL show the create-profile form as it does today.

#### Scenario: Discovered profiles precede the create form

- **WHEN** the registry is empty and discovery finds profiles
- **THEN** the setup screen shows a row for each with an open action, and the
  create-profile form below them

#### Scenario: Opening a row adopts and activates

- **WHEN** the user opens a discovered profile from the first-run screen
- **THEN** that profile becomes active and the app proceeds with its data

#### Scenario: No candidates means no regression

- **WHEN** the registry is empty and discovery finds no profiles
- **THEN** the setup screen shows only the create-profile form

#### Scenario: Creating a new profile still works

- **WHEN** discovery finds profiles and the user submits the create-profile form
- **THEN** a new profile is created and activated as it is today

### Requirement: Profile switching stays reachable

The profile switcher SHALL list unregistered profiles that discovery finds,
whether or not the registry already lists profiles, so adopting one never hides
the others. The switcher SHALL NOT render when neither the registry nor
discovery finds a profile.

#### Scenario: Switcher renders on an empty registry with candidates

- **WHEN** the registry lists no profiles and discovery finds profiles
- **THEN** the switcher renders and lists them

#### Scenario: Remaining candidates stay available

- **WHEN** the registry lists a profile and discovery finds other unregistered
  profiles
- **THEN** the switcher lists those candidates alongside the registered profile

#### Scenario: Switcher stays hidden with nothing to show

- **WHEN** the registry lists no profiles and discovery finds nothing
- **THEN** the switcher does not render

### Requirement: Recovery offers salvage before reset

When the startup registry check fails, the recovery dialog SHALL offer keeping
the profiles that the broken registry names and whose directories still exist.
Choosing it SHALL write a valid registry containing those profiles and SHALL
preserve the broken file as a backup. Reset SHALL remain available. When the
broken registry names no profile whose directory exists, the dialog SHALL offer
Reset only.

#### Scenario: Salvage keeps existing profiles

- **WHEN** the broken registry names three profiles and two directories still
  exist
- **THEN** the salvage choice writes a registry with those two profiles, backs
  up the broken file, and requests a restart

#### Scenario: Salvage is skipped when nothing can be kept

- **WHEN** the broken registry names profiles but no named directory exists
- **THEN** the dialog offers Reset and Open Folder without a salvage choice

#### Scenario: A broken file that is not valid JSON still resets

- **WHEN** `profiles.json` cannot be parsed at all
- **THEN** the dialog offers Reset and the existing reset behavior is unchanged
