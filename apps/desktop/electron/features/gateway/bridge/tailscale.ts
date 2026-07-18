/**
 * Tailscale integration for secure remote gateway access.
 *
 * Detects if Tailscale is installed and running, and can expose the
 * gateway to the private tailnet using `tailscale serve`.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const TAILSCALE_BIN = '/usr/local/bin/tailscale';
const TAILSCALE_BIN_ALT = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';

export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  hostname?: string;
  tailnetIp?: string;
  /** Full tailnet URL for the gateway (e.g. https://my-mac.tail1234.ts.net:18800). */
  gatewayUrl?: string;
}

export class TailscaleIntegration {
  private tailscaleBin: string | null = null;
  private servingPort: number | null = null;

  /** Find the tailscale binary. */
  private async findBinary(): Promise<string | null> {
    if (this.tailscaleBin) return this.tailscaleBin;

    const candidates = [TAILSCALE_BIN, TAILSCALE_BIN_ALT, 'tailscale'];
    const results = await Promise.all(candidates.map(async (bin) => {
      try {
        await execFileAsync(bin, ['version'], { timeout: 5000 });
        return bin;
      } catch {
        return null;
      }
    }));

    this.tailscaleBin = results.find((bin): bin is string => bin !== null) ?? null;
    if (this.tailscaleBin) return this.tailscaleBin;
    return null;
  }

  /** Check Tailscale status. */
  async getStatus(): Promise<TailscaleStatus> {
    const bin = await this.findBinary();
    if (!bin) {
      return { installed: false, running: false };
    }

    try {
      const { stdout } = await execFileAsync(bin, ['status', '--json'], {
        timeout: 10000,
      });
      const status = JSON.parse(stdout);

      if (!status.Self) {
        return { installed: true, running: false };
      }

      const hostname = status.Self.HostName;
      const dnsName = status.Self.DNSName?.replace(/\.$/, '');
      const tailnetIps = status.Self.TailscaleIPs ?? [];
      const tailnetIp = tailnetIps[0];

      return {
        installed: true,
        running: true,
        hostname,
        tailnetIp,
        // `tailscale serve` proxies the local port onto standard HTTPS (443),
        // so the tailnet URL never includes a port number.
        gatewayUrl: dnsName ? `https://${dnsName}` : undefined,
      };
    } catch {
      return { installed: true, running: false };
    }
  }

  /** Get the Tailscale IP to bind the gateway to. */
  async getTailscaleIp(): Promise<string | null> {
    const status = await this.getStatus();
    return status.tailnetIp ?? null;
  }

  /**
   * Expose a local port on the tailnet using `tailscale serve`.
   * This makes the gateway accessible to other devices on your tailnet.
   * Does NOT use Funnel (no public internet exposure).
   *
   * When a preview mapping is given, the dev-server preview listener is
   * also exposed, on its own HTTPS port — previews must keep a separate
   * origin from the SPA (see GatewayConfig.previewPort).
   */
  async serve(
    port: number,
    preview?: { previewPort: number; previewTlsPort: number },
  ): Promise<string | null> {
    const bin = await this.findBinary();
    if (!bin) return null;

    try {
      // `tailscale serve --bg <port>` exposes http://127.0.0.1:<port>
      // on the tailnet at https://<hostname> (standard HTTPS, port 443).
      // Traffic is automatically TLS-terminated by Tailscale.
      await execFileAsync(
        bin,
        ['serve', '--bg', String(port)],
        { timeout: 15000 },
      );
      this.servingPort = port;

      if (preview) {
        // Preview listener → https://<hostname>:<previewTlsPort>.
        // Non-fatal: without it the SPA still works, only embedded
        // previews are unavailable remotely.
        try {
          await execFileAsync(
            bin,
            ['serve', '--bg', `--https=${preview.previewTlsPort}`, String(preview.previewPort)],
            { timeout: 15000 },
          );
        } catch (err) {
          console.error('[tailscale] Failed to serve preview port:', err);
        }
      }

      const status = await this.getStatus();
      console.log(
        `[tailscale] Serving port ${port} on tailnet: ${status.gatewayUrl}`,
      );
      return status.gatewayUrl ?? null;
    } catch (err) {
      console.error('[tailscale] Failed to serve:', err);
      return null;
    }
  }

  /** Stop serving on the tailnet. */
  async unserve(): Promise<void> {
    if (!this.servingPort) return;

    const bin = await this.findBinary();
    if (!bin) return;

    try {
      await execFileAsync(bin, ['serve', 'reset'], { timeout: 10000 });
      console.log(`[tailscale] Stopped serving port ${this.servingPort}`);
    } catch {
      // May not be serving
    }
    this.servingPort = null;
  }
}
