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

    for (const bin of [TAILSCALE_BIN, TAILSCALE_BIN_ALT, 'tailscale']) {
      try {
        await execFileAsync(bin, ['version'], { timeout: 5000 });
        this.tailscaleBin = bin;
        return bin;
      } catch {
        // Not found, try next
      }
    }
    return null;
  }

  /** Check Tailscale status. */
  async getStatus(gatewayPort?: number): Promise<TailscaleStatus> {
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
        gatewayUrl:
          dnsName && gatewayPort
            ? `https://${dnsName}:${gatewayPort}`
            : undefined,
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
   */
  async serve(port: number): Promise<string | null> {
    const bin = await this.findBinary();
    if (!bin) return null;

    try {
      // `tailscale serve --bg <port>` exposes http://127.0.0.1:<port>
      // on the tailnet at https://<hostname>:<port>. Traffic is
      // automatically TLS-terminated by Tailscale.
      await execFileAsync(
        bin,
        ['serve', '--bg', String(port)],
        { timeout: 15000 },
      );
      this.servingPort = port;

      const status = await this.getStatus(port);
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
