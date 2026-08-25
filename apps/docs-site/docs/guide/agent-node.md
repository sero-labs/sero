# Connect to an Agent Node

Agent Node runs a persistent Sero agent on a Linux computer. Sero Desktop
controls the node. The agent can continue work when Desktop disconnects.

Agent Node supports Linux x64 and Linux arm64. NVIDIA DGX Spark is a supported
arm64 target. AWS Bedrock is not supported on Agent Node. Use another provider
or a local OpenAI-compatible endpoint.

## Before you connect

Ask the node operator for these items:

- the node address and port
- the one-time enrolment code
- the node identity fingerprint

Sero does not search the local network for a node. Enter its DNS name or IP
address manually. Use an address that your computer can reach. Do not bypass a
TLS warning.

## Enrol the node

1. In Sero Desktop, open **Agent Nodes**.
2. Select **Add node**.
3. Enter the node address and the one-time code.
4. Compare the shown identity fingerprint with the operator's fingerprint.
5. Confirm the enrolment only when the two values match.

Enrolment pins the node identity. The node sends only its public identity key.
Its private identity key does not leave the node. If the identity changes, Sero
requires a new enrolment.

## Connect a provider

Provider authentication is separate from node enrolment. Open the node's
provider settings in Desktop. You can enter an API key or start a provider
login. For a browser login, Desktop opens the provider page and shows any
device code or manual code. The node does not need a browser.

Only one provider login can run at a time. Desktop shows masked provider status.
It does not receive a provider key or token from the node. An OAuth login can
expire or be revoked. If refresh fails, the current turn stops. The session and
completed tool results remain. Reconnect the provider, then start the turn
again.

OpenAI ChatGPT device login is beta. The account owner or workspace
administrator must enable device-code authentication. Provider terms can limit
subscription use on an unattended node. Check the provider terms.

## Disconnect and reconnect

The node keeps active work when Desktop loses its connection. On reconnect,
Desktop gets the durable task state and asks for missed Sero events. It then
subscribes to new A2A events. A2A alone does not replay missed stream events.

Do not use a task state change as approval for a new action. Sero keeps control
approval and A2A task state separate.

Agent Node does not install or update itself, Sero Desktop, or other node
software through this connection. The node operator owns installation and
updates.

For service and security procedures, see
[Agent Node Operations](/reference/agent-node-operations).
