import {
  argsWithClient,
  deriveKeyringPassword,
  gogExecWithPassword,
  pipeToGog,
} from './gog-keyring';
import {
  AUTH_URL,
  TOKEN_URL,
  getGoogleCredentials,
} from './config';

export class GoogleCredentialManager {
  private readonly credsImportedClients = new Set<string>();

  reset(): void {
    this.credsImportedClients.clear();
  }

  async ensureCredentials(clientName: string): Promise<void> {
    if (this.credsImportedClients.has(clientName)) return;

    if (await this.clientHasCredentials(clientName)) {
      this.credsImportedClients.add(clientName);
      return;
    }

    const creds = getGoogleCredentials();
    const importResult = await pipeToGog(
      argsWithClient(clientName, ['auth', 'credentials', 'set', '-']),
      JSON.stringify({
        installed: {
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          auth_uri: AUTH_URL,
          token_uri: TOKEN_URL,
          redirect_uris: ['http://localhost'],
        },
      }),
    );

    if (importResult.ok) {
      this.credsImportedClients.add(clientName);
      return;
    }

    console.warn(
      `[google-auth] Failed to import OAuth credentials for client ${clientName}:`,
      importResult.out,
    );
  }

  async importRefreshToken(clientName: string, email: string, refreshToken: string): Promise<void> {
    await this.ensureCredentials(clientName);

    const importResult = await pipeToGog(
      argsWithClient(clientName, ['auth', 'tokens', 'import', '-']),
      JSON.stringify({ email, refresh_token: refreshToken }),
    );

    if (importResult.ok) {
      console.log('[google-auth] Token imported into gogcli for', email);
      return;
    }

    console.warn('[google-auth] Token import failed:', importResult.out);
  }

  private async clientHasCredentials(clientName: string): Promise<boolean> {
    const status = await gogExecWithPassword(
      argsWithClient(clientName, ['--json', 'auth', 'status']),
      deriveKeyringPassword(),
    );
    if (!status) return false;

    try {
      const parsed = JSON.parse(status) as { account?: { credentials_exists?: boolean } };
      return parsed.account?.credentials_exists === true;
    } catch {
      return false;
    }
  }
}
