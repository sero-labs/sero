## Purpose

Keeps a test process from resolving and writing the machine's real Sero root, so
a test run can never damage a live profile registry.

## ADDED Requirements

### Requirement: Refuse the real Sero root under a test runner

When a test runner is detected and no root override is set, resolving the Sero
root SHALL fail with an error that names the override the caller must set. A
test runner is detected by `VITEST` or by `NODE_ENV` set to `test`. An explicit
override SHALL still be honoured, and outside a test runner the existing
home-directory fallback SHALL be unchanged.

#### Scenario: Registry root resolution fails without an override

- **WHEN** a test process resolves the profile registry root with no
  `SERO_HOME_OVERRIDE` or `SERO_FIXED_ROOT_OVERRIDE` set
- **THEN** resolution throws an error naming the missing override

#### Scenario: Fixed root resolution fails without an override

- **WHEN** a test process resolves the fixed Sero root with no override set
- **THEN** resolution throws an error naming the missing override

#### Scenario: An override is honoured under a test runner

- **WHEN** a test process sets the root override
- **THEN** resolution returns that override and does not throw

#### Scenario: Production resolution is unchanged

- **WHEN** no test runner is detected
- **THEN** resolution falls back to the home directory as it does today

### Requirement: Profile tests state their root explicitly

Profile test files SHALL set the root override to their own temporary directory
instead of replacing `HOME`, so the test states where it writes rather than
inferring it.

#### Scenario: Registry tests pass with an explicit root

- **WHEN** the profile registry tests run
- **THEN** each sets the root override and the suite passes

#### Scenario: The real registry is untouched

- **WHEN** the profile registry tests run
- **THEN** the real `~/.sero-ui/profiles.json` is unchanged

### Requirement: Profile log output is visible in tests

Console output prefixed `[sero:profile]` SHALL NOT be suppressed by the test
setup, so a test that writes to a profile registry leaves a visible trace.

#### Scenario: A profile log line reaches test output

- **WHEN** code logs with the `[sero:profile]` prefix during a test
- **THEN** the message appears in the test output
