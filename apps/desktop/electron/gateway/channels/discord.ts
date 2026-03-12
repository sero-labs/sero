/**
 * Discord channel adapter for the Sero gateway.
 *
 * Connects to Discord as a bot, listens for DMs and mentions,
 * routes messages to the gateway, and streams responses back.
 */

import { nativeImage, net } from 'electron';
import type { ResponseLike } from '@discordjs/rest';

import type { GatewayServer, GatewayAgentOps } from '../index';
import type { GatewayPushEvent } from '../protocol';

// discord.js is dynamically imported to avoid hard dependency at startup
let Discord: typeof import('discord.js') | null = null;

/**
 * Use Electron/Chromium's HTTP stack for Discord REST API calls.
 *
 * undici (used by @discordjs/rest) has its TLS connections to Discord
 * (Cloudflare) rejected in the Electron environment — "other side closed"
 * with bytesWritten: 0. Chromium's networking works reliably.
 *
 * net.fetch returns a standard Web API Response whose types (Headers,
 * ReadableStream) are runtime-identical to their Node.js counterparts
 * but carry incompatible TS declarations. The cast to ResponseLike is
 * safe — both implement the same web-standard interfaces.
 */
async function chromiumFetch(
  url: string,
  init: Record<string, unknown>,
): Promise<ResponseLike> {
  const response = await net.fetch(url, init as RequestInit);
  return response as unknown as ResponseLike;
}

export interface DiscordAdapterConfig {
  /** Discord bot token. */
  botToken: string;
  /** Allowed Discord user IDs (empty = allow all). */
  allowedUsers: string[];
  /** Default workspace ID for Discord-initiated sessions. */
  defaultWorkspaceId: string;
}

interface ActiveSession {
  sessionId: string;
  channelId: string;
  /** Accumulated text for the current response. */
  responseBuffer: string;
  /** Timer to flush response buffer. */
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** True while the agent is actively processing (between agent_start/agent_end). */
  isProcessing: boolean;
}

export class DiscordAdapter {
  private client: InstanceType<typeof import('discord.js').Client> | null = null;
  private gateway: GatewayServer;
  private agentOps: GatewayAgentOps;
  private config: DiscordAdapterConfig;
  /** channelId → active session info */
  private sessions = new Map<string, ActiveSession>();
  private unsubscribeEvents: (() => void) | null = null;

  constructor(gateway: GatewayServer, agentOps: GatewayAgentOps, config: DiscordAdapterConfig) {
    this.gateway = gateway;
    this.agentOps = agentOps;
    this.config = config;
  }

  async start(): Promise<void> {
    // Security: fail-closed — refuse to start if no user whitelist
    if (this.config.allowedUsers.length === 0) {
      console.warn(
        '[discord] SERO_DISCORD_USERS is empty — Discord adapter disabled for security. ' +
        'Set SERO_DISCORD_USERS to a comma-separated list of Discord usernames or user IDs to enable.',
      );
      return;
    }

    try {
      Discord = await import('discord.js');
    } catch {
      console.error(
        '[discord] discord.js not installed. Run: pnpm add discord.js',
      );
      return;
    }

    const { Client, GatewayIntentBits, Partials } = Discord;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
      rest: {
        timeout: 60_000,
        makeRequest: chromiumFetch,
      },
    });

    this.client.on('ready', () => {
      console.log(
        `[discord] Bot connected as ${this.client?.user?.tag}`,
      );
    });

    this.client.on('messageCreate', (msg) => this.handleMessage(msg));

    // Subscribe to gateway push events to relay back to Discord
    this.unsubscribeEvents = this.subscribeToGatewayEvents();

    await this.client.login(this.config.botToken);
  }

  async stop(): Promise<void> {
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = null;
    }
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    console.log('[discord] Bot disconnected');
  }

  private async handleMessage(
    msg: import('discord.js').Message,
  ): Promise<void> {
    // Ignore bot messages
    if (msg.author.bot) return;

    // Access control — fail-closed: if no allowedUsers configured, deny all
    if (this.config.allowedUsers.length === 0) {
      return;
    }
    // Match by numeric user ID, username, or legacy tag (User#1234).
    // This lets SERO_DISCORD_USERS accept either format.
    const isAllowed = this.config.allowedUsers.some((allowed) => {
      const lower = allowed.toLowerCase();
      return (
        msg.author.id === allowed ||
        msg.author.username.toLowerCase() === lower ||
        msg.author.tag.toLowerCase() === lower
      );
    });
    if (!isAllowed) {
      console.warn(
        `[discord] Message rejected from unauthorized user: ${msg.author.tag} (${msg.author.id})`,
      );
      return;
    }

    // Check if it's a DM or a mention
    const isDM = !msg.guild;
    const isMention = msg.mentions.has(this.client!.user!);

    if (!isDM && !isMention) return;

    // Strip bot mention from the message
    let text = msg.content;
    if (this.client?.user) {
      text = text.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    }

    if (!text) {
      await msg.reply(
        'Send me a message and I\'ll work on it. Example: "Add a dark mode toggle to the settings page"',
      );
      return;
    }

    // Handle special commands
    if (text.startsWith('/sero ')) {
      const subcommand = text.slice(6).trim();
      await this.handleCommand(msg, subcommand);
      return;
    }

    // Get or create session for this channel
    const session = this.getOrCreateSession(msg.channel.id);

    // Send typing indicator
    try {
      await (msg.channel as any).sendTyping?.();
    } catch {
      // Non-critical
    }

    // Route to agent — steer if already processing, otherwise prompt
    try {
      if (session.isProcessing) {
        await this.agentOps.steer(session.sessionId, text);
      } else {
        session.responseBuffer = '';
        if (session.flushTimer) clearTimeout(session.flushTimer);

        // Open a session (creates one if needed) and send the prompt.
        // Events flow back via the gateway event bridge → handleGatewayEvent.
        await this.agentOps.openSession(
          session.sessionId,
          this.config.defaultWorkspaceId,
        );
        await this.agentOps.prompt(session.sessionId, text);
      }
    } catch (err) {
      await msg.reply(
        `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
      );
    }
  }

  private async handleCommand(
    msg: import('discord.js').Message,
    command: string,
  ): Promise<void> {
    switch (command) {
      case 'status':
        const status = this.gateway.getStatus();
        await msg.reply(
          `Gateway: ${status.running ? 'running' : 'stopped'}\n` +
          `Port: ${status.port}\n` +
          `Connected clients: ${status.clients}`,
        );
        break;

      case 'abort': {
        const session = this.sessions.get(msg.channel.id);
        if (session) {
          await msg.reply('Aborting current task...');
        } else {
          await msg.reply('No active session in this channel.');
        }
        break;
      }

      default:
        await msg.reply(
          'Available commands:\n' +
          '`/sero status` — Check gateway status\n' +
          '`/sero abort` — Abort current task\n' +
          'Or just send a message to start a task.',
        );
    }
  }

  private getOrCreateSession(channelId: string): ActiveSession {
    let session = this.sessions.get(channelId);
    if (!session) {
      session = {
        sessionId: `discord-${channelId}-${Date.now()}`,
        channelId,
        responseBuffer: '',
        flushTimer: null,
        isProcessing: false,
      };
      this.sessions.set(channelId, session);
    }
    return session;
  }

  /**
   * Subscribe to gateway push events and relay to the appropriate Discord channel.
   * Returns an unsubscribe function.
   */
  private subscribeToGatewayEvents(): () => void {
    // The gateway server will call pushEvent/broadcastEvent.
    // We monkey-patch the gateway's broadcastEvent to also send to Discord.
    // This is a lightweight approach that avoids modifying the gateway protocol.

    const originalBroadcast = this.gateway.broadcastEvent.bind(this.gateway);
    const originalPush = this.gateway.pushEvent.bind(this.gateway);

    this.gateway.broadcastEvent = (event: GatewayPushEvent) => {
      originalBroadcast(event);
      this.handleGatewayEvent(event);
    };

    this.gateway.pushEvent = (sessionId: string, event: GatewayPushEvent) => {
      originalPush(sessionId, event);
      this.handleGatewayEvent(event);
    };

    return () => {
      this.gateway.broadcastEvent = originalBroadcast;
      this.gateway.pushEvent = originalPush;
    };
  }

  private handleGatewayEvent(event: GatewayPushEvent): void {
    // Find the Discord session that matches this event's sessionId
    for (const [, session] of this.sessions) {
      if ('sessionId' in event && event.sessionId !== session.sessionId) continue;

      if (event.type === 'agent_start') {
        session.isProcessing = true;
      } else if (event.type === 'text_delta') {
        session.responseBuffer += event.delta;
        this.scheduleFlush(session);
      } else if (event.type === 'agent_end') {
        session.isProcessing = false;
        this.flushBuffer(session);
      } else if (event.type === 'tool_end') {
        // Send tool result images (e.g. screenshots) as Discord attachments
        if (event.images?.length) {
          for (const img of event.images) {
            const format = img.mimeType.replace('image/', '') || 'png';
            void this.sendImage(session.channelId, img.data, format, img.description);
          }
        }
      }
    }
  }

  /** Max dimension (width or height) before downscaling for Discord. */
  private static readonly MAX_IMAGE_DIM = 1920;
  /** JPEG quality for compressed Discord uploads (0–100). */
  private static readonly JPEG_QUALITY = 90;

  /**
   * Downscale and compress an image buffer for Discord.
   *
   * - Images larger than MAX_IMAGE_DIM on either axis are downscaled
   *   proportionally.
   * - Output is always JPEG at JPEG_QUALITY — screenshots go from
   *   5–10 MB PNG to ~200–500 KB, making uploads near-instant.
   * - Falls back to the original buffer if nativeImage can't decode it.
   */
  private compressImage(raw: Buffer): { buffer: Buffer; ext: string } {
    const image = nativeImage.createFromBuffer(raw);
    if (image.isEmpty()) {
      // Can't decode — send the original unchanged
      return { buffer: raw, ext: 'png' };
    }

    const { width, height } = image.getSize();
    const maxDim = Math.max(width, height);

    let output = image;
    if (maxDim > DiscordAdapter.MAX_IMAGE_DIM) {
      const scale = DiscordAdapter.MAX_IMAGE_DIM / maxDim;
      output = image.resize({
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      });
    }

    return { buffer: output.toJPEG(DiscordAdapter.JPEG_QUALITY), ext: 'jpg' };
  }

  /**
   * Send a base64-encoded image to a Discord channel as a file attachment.
   *
   * The image is downscaled and JPEG-compressed before upload to keep
   * file sizes small and uploads fast. Discord free-tier limit is 25 MB.
   */
  private async sendImage(
    channelId: string,
    base64: string,
    format: string,
    caption?: string,
  ): Promise<void> {
    if (!this.client) return;

    const rawBuffer = Buffer.from(base64, 'base64');
    const rawMB = rawBuffer.byteLength / (1024 * 1024);

    const { buffer, ext } = this.compressImage(rawBuffer);
    const finalMB = buffer.byteLength / (1024 * 1024);

    console.log(
      `[discord] Image: ${rawMB.toFixed(2)} MB (${format}) → ${finalMB.toFixed(2)} MB (${ext})`,
    );

    if (buffer.byteLength > 25 * 1024 * 1024) {
      console.warn(
        `[discord] Image still too large after compression (${finalMB.toFixed(1)} MB > 25 MB limit), skipping`,
      );
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !('send' in channel)) return;
      await (channel as any).send({
        content: caption ?? undefined,
        files: [{ attachment: buffer, name: `screenshot.${ext}` }],
      });
      console.log(`[discord] Image sent successfully (${finalMB.toFixed(2)} MB)`);
    } catch (err) {
      console.error('[discord] Failed to send image:', err);
    }
  }

  private scheduleFlush(session: ActiveSession): void {
    if (session.flushTimer) return;
    // Flush every 2 seconds to batch updates
    session.flushTimer = setTimeout(() => {
      this.flushBuffer(session);
    }, 2000);
  }

  private async flushBuffer(session: ActiveSession): Promise<void> {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }

    const text = session.responseBuffer.trim();
    if (!text) return;
    session.responseBuffer = '';

    if (!this.client) return;

    try {
      const channel = await this.client.channels.fetch(session.channelId);
      if (!channel || !('send' in channel)) return;

      // Discord has a 2000 character limit per message
      const chunks = splitMessage(text, 2000);
      for (const chunk of chunks) {
        await (channel as any).send(chunk);
      }
    } catch (err) {
      console.error('[discord] Failed to send message:', err);
    }
  }
}

/** Split a long message into chunks respecting Discord's limit. */
function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < maxLength * 0.5) {
      // No good newline break, split at max length
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
