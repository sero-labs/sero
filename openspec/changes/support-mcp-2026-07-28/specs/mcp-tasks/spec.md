# Spec Delta

## Purpose

Lets an MCP server run a tool call as a durable task (`io.modelcontextprotocol/tasks`), so that long work survives a Sero restart and returns its result to the conversation that started it.

## ADDED Requirements

### Requirement: Advertise Tasks only when ready
Sero SHALL declare the Tasks extension in its client capabilities only when the task host path is enabled. A tool call SHALL accept either a normal result or a task result.

#### Scenario: Server returns a normal result
- **WHEN** Sero calls a tool on a server that supports Tasks and the server returns a normal result
- **THEN** the agent receives that result with no task record

#### Scenario: Server returns a task
- **WHEN** the server returns a task result for a tool call
- **THEN** Sero records the task and shows it as running in the originating conversation

### Requirement: Durable task records
For each task, Sero SHALL persist the owning profile, server identity, authorization principal, originating session and tool call, task ID, protocol generation, status, retention and next poll time. Task records SHALL survive a Sero restart.

#### Scenario: Restart during a task
- **WHEN** Sero quits while a task is `working`
- **AND** Sero starts again
- **THEN** Sero resumes the task from its record
- **AND** the final result goes to the originating session

### Requirement: Polling and subscription
Sero SHALL poll task status at the interval that the server suggests, with a lower bound that protects the server. When the server offers task status notifications through `subscriptions/listen`, Sero SHALL use them and SHALL fall back to polling when the stream closes or is not offered.

#### Scenario: Suggested interval
- **WHEN** the task view suggests a poll interval of 5000 ms
- **THEN** Sero asks for the task status about every 5 seconds

#### Scenario: Subscription stream closes
- **WHEN** the status stream closes without a final status
- **THEN** Sero continues to track the task by polling

### Requirement: Task states
Sero SHALL support the `working`, `input_required`, `completed`, `failed` and `cancelled` states. On `completed`, Sero SHALL deliver the result to the originating session. On `failed`, it SHALL deliver the error. On `cancelled`, it SHALL deliver a cancelled outcome.

#### Scenario: Task fails
- **WHEN** a task reaches `failed`
- **THEN** the originating session receives the failure as an error result

### Requirement: Task input
When a task reaches `input_required`, Sero SHALL present its input requests through the MCP elicitation path and SHALL send the answers to the server with a task update.

#### Scenario: Task asks for input
- **WHEN** a running task asks for a confirmation
- **AND** the user confirms
- **THEN** Sero sends the confirmation as a task update and the task continues

### Requirement: Cancellation
The user SHALL be able to cancel a running task from the conversation and from the recovery surface. Sero SHALL send a cooperative cancel to the server. When the server does not support cancellation, Sero SHALL say so and SHALL keep tracking the task.

#### Scenario: Cancel a task
- **WHEN** the user cancels a running task
- **THEN** Sero sends a cancel request and the task shows `cancelled` when the server confirms

### Requirement: Expiry and identity guards
Sero SHALL remove a local task record when its server retention time ends. Sero MUST NOT resume a task under a different profile, server or authorization principal than the one that created it.

#### Scenario: Retention ends
- **WHEN** a task's retention time has passed
- **THEN** Sero removes the record and shows the task as expired

#### Scenario: Principal changed
- **WHEN** the user signed in to the server as a different account after the task started
- **THEN** Sero does not resume the task under the new account
- **AND** the recovery surface shows why the task cannot resume

### Requirement: Lost connection
When the server cannot be reached while a task is running, Sero SHALL keep the record, show the task as disconnected, and resume tracking when the connection returns, until retention ends.

#### Scenario: Server comes back
- **WHEN** the server is unreachable for one poll and reachable on the next
- **THEN** the task continues to its final state

### Requirement: Detached task recovery surface
The MCP app SHALL list tasks whose originating session is closed or gone, with their server, tool, status and age, and SHALL let the user view the result, cancel or dismiss each task.

#### Scenario: Originating session deleted
- **WHEN** a task completes after its originating session was deleted
- **THEN** the task and its result appear in the MCP app's task list
