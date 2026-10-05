# Spec Delta

## Purpose

Makes Sero's MCP OAuth client meet the `2026-07-28` authorization rules, so that an authorization code or a stored credential is never used with the wrong authorization server.

## ADDED Requirements

### Requirement: Issuer validation before code exchange
Sero SHALL compare the `iss` value in the authorization callback with the issuer from the validated authorization server metadata before it exchanges the code. A mismatch MUST stop the flow before the code exchange. A missing `iss` MUST stop the flow when the server declares `authorization_response_iss_parameter_supported: true`. Sero SHALL also check the callback `state` before any exchange.

#### Scenario: Issuer mismatch
- **WHEN** the callback carries an `iss` that differs from the expected issuer
- **THEN** Sero does not send a token request
- **AND** the server shows an authorization failure

#### Scenario: Attacker-controlled error text
- **WHEN** a callback fails issuer validation and carries `error_description`
- **THEN** Sero does not show the `error_description` text to the user

#### Scenario: Missing iss when required
- **WHEN** the metadata declares `authorization_response_iss_parameter_supported: true` and the callback has no `iss`
- **THEN** Sero stops the flow before the code exchange

### Requirement: Credentials are bound to their issuer
Sero SHALL store the issuer with each set of tokens and client credentials, and SHALL persist the authorization server discovery state. Sero MUST NOT use tokens or client credentials with an authorization server other than the one that issued them.

#### Scenario: Authorization server changes
- **WHEN** a server's protected resource metadata starts to name a different authorization server
- **THEN** Sero does not send the old tokens or client credentials to the new server
- **AND** Sero asks the user to authorize again

#### Scenario: Credentials saved by the previous version
- **WHEN** Sero loads tokens that were saved without an issuer
- **THEN** the tokens continue to work
- **AND** Sero stores the issuer with them on the next successful use

### Requirement: Client registration preference
When Sero has a published Client ID Metadata Document URL, Sero SHALL use it when the authorization server supports Client ID Metadata Documents. Sero SHALL use Dynamic Client Registration only as a fallback, and SHALL register as a native application with loopback redirect URIs. A client ID that the user configures for a server SHALL take precedence over both.

#### Scenario: Server supports client metadata documents
- **WHEN** Sero has a published Client ID Metadata Document URL and the authorization server declares support for Client ID Metadata Documents
- **THEN** Sero uses that URL as its client ID and does not call the registration endpoint

#### Scenario: Registration fallback
- **WHEN** the server supports only Dynamic Client Registration
- **THEN** the registration request has `application_type: "native"`

### Requirement: Secure token endpoint and scope step-up
Sero MUST NOT send a token request to a non-TLS token endpoint unless the endpoint is on a loopback host. When a server rejects a request with `403 insufficient_scope`, Sero SHALL ask the user to authorize the wider scope once, and SHALL show a failure if the retry is rejected again.

#### Scenario: Plain HTTP token endpoint
- **WHEN** the token endpoint is `http://auth.example.com/token`
- **THEN** Sero stops the flow and shows an insecure endpoint error

#### Scenario: Scope step-up
- **WHEN** a tool call fails with `403 insufficient_scope`
- **THEN** Sero asks the user to authorize the wider scope once
