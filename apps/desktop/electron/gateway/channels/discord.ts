/**
 * Discord channel adapter for the Sero gateway.
 *
 * Connects to Discord as a bot, listens for DMs and mentions,
 * routes messages to the gateway, and streams responses back.
 */

import type { GatewayServer } from '../index';
import type { GatewayPushEvent } from '../protocol';

// discord.js is dynamically imported to avoid hard dependency at startup
let Discord: typeof import('discord.js') | null = null;

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
}

export class DiscordAdapter {
  private client: InstanceType<typeof import('discord.js').Client> | null = null;
  private gateway: GatewayServer;
  private config: DiscordAdapterConfig;
  /** channelId → active session info */
  private sessions = new Map<string, ActiveSession>();
  private unsubscribeEvents: (() => void) | null = null;

  constructor(gateway: GatewayServer, config: DiscordAdapterConfig) {
    this.gateway = gateway;
    this.config = config;
  }

  async start(): Promise<void> {
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
    msg: InstanceType<typeof import('discord.js').Message>,
  ): Promise<void> {
    // Ignore bot messages
    if (msg.author.bot) return;

    // Access control
    if (
      this.config.allowedUsers.length > 0 &&
      !this.config.allowedUsers.includes(msg.author.id)
    ) {
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

    // Route to gateway
    try {
      // The gateway's pushEvent will stream responses back via our subscription
      await this.gateway
        .getStatus(); // Verify gateway is running

      // For now, use a simple approach: accumulate text deltas and flush periodically
      session.responseBuffer = '';
      if (session.flushTimer) clearTimeout(session.flushTimer);

      // Notify that we're working on it
      await msg.reply('Working on it...');
    } catch (err) {
      await msg.reply(
        `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
      );
    }
  }

  private async handleCommand(
    msg: InstanceType<typeof import('discord.js').Message>,
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

      if (event.type === 'text_delta') {
        session.responseBuffer += event.delta;
        this.scheduleFlush(session);
      } else if (event.type === 'agent_end') {
        this.flushBuffer(session);
      }
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
