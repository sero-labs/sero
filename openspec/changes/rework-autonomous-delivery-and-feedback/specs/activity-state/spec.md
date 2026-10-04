## MODIFIED Requirements

### Requirement: Working requires an observed report

A surface SHALL show `working` only while a run is attached and its producer has confirmed current activity in this Sero session. Saved running, active or in-progress status MUST NOT establish liveness. Contact SHALL be derived from the producer's open request or tool state in the current session, including during a quiet in-flight model or tool request; a renewal timer is added only where that state cannot be observed. Process contact SHALL be distinct from meaningful activity: a contact update MUST NOT claim new output or progress. If the producer is lost or none is attached, the surface SHALL show `last-known` with the last observed activity time and an unavailable timestamp where none exists. Terminal saved facts SHALL retain their actual state. Silence alone MUST NOT be called failure.

#### Scenario: A saved status outlives its run
- **WHEN** a project's milestone is saved as running but no producer is attached in this session
- **THEN** the row reads Last known and never Working solely from that saved status

#### Scenario: A live run reports
- **WHEN** an attached run reports current activity in this session
- **THEN** the surface reads Working and names the work and its owner

#### Scenario: A model request is quiet
- **WHEN** the producer confirms an attached in-flight request but no output has arrived recently
- **THEN** the activity stays Working, names the request wait and retains the unchanged last meaningful activity time
- **AND** it does not invent reasoning text or progress

#### Scenario: Observation is lost
- **WHEN** the current session loses the producer while the saved run status remains running
- **THEN** the activity becomes Last known without claiming failure, continued execution or zero elapsed work

### Requirement: No invented progress

An activity state MUST NOT be accompanied by an invented percentage, finish time or elapsed timer presented as progress. Known completed work SHALL use counts from saved records. Explicitly labelled observed wait duration, active runtime and remaining budget SHALL be allowed as time or limit facts, not evidence of completed work. An unavailable measurement MUST remain unavailable rather than zero.

#### Scenario: Completed milestones
- **WHEN** six of seven milestones have been accepted
- **THEN** a work-detail view can show 6 of 7 accepted without an invented percentage or completion estimate

#### Scenario: Request wait
- **WHEN** a known request has been in flight for two minutes
- **THEN** the surface can label that observed wait duration without implying two minutes of progress or a completion estimate

#### Scenario: No measured start
- **WHEN** the source does not provide a request start or active-time measurement
- **THEN** the corresponding duration is unavailable, not synthesized from a saved running label
