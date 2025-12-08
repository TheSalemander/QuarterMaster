// countdown.js
import cron from 'node-cron';
import { EmbedBuilder } from 'discord.js';

const END_AT = new Date('2025-12-31T23:59:59+02:00'); // Helsinki time (UTC+2 in late Dec)
const TZ = 'Europe/Helsinki';
const PLAYER_ROLE_ID = '1430444494662139966'; // @pelaaja

function formatRemaining(ms) {
  if (ms <= 0) return '0 days 0 hours 0 minutes 0 seconds';
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return `${days} days ${hours} hours ${mins} minutes ${secs} seconds`;
}

function buildEmbed(now) {
  const remaining = END_AT - now;
  return new EmbedBuilder()
    .setTitle('⏳ Pauper Liiga – Year-End Countdown')
    .setDescription(
      `Time remaining until **December 31, 2025, 23:59:59 (Helsinki)**:\n` +
      `**${formatRemaining(remaining)}**`
    )
    .setFooter({ text: 'Weekly reminder • Quartermaster' })
    .setTimestamp(now);
}

/**
 * Call this once from your main file after the client is ready.
 * It will:
 * - Post every Monday at 09:00 Helsinki time
 * - Ping @pelaaja
 * - Stop after the deadline
 */
export function setupCountdown(client) {
  const channelId = process.env.COUNTDOWN_CHANNEL_ID;
  if (!channelId) {
    console.warn('[countdown] COUNTDOWN_CHANNEL_ID not set, skipping countdown scheduler.');
    return;
  }

  cron.schedule(
    '0 9 * * 1', // minute hour day-of-month month day-of-week -> Monday 09:00
    async () => {
      try {
        const now = new Date();

        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          console.warn('[countdown] Channel not found or not text-based');
          return;
        }

        // If we’ve passed the end time, send final message and stop
        if (now >= END_AT) {
          await channel.send({
            content: `<@&${PLAYER_ROLE_ID}>`,
            embeds: [
              new EmbedBuilder()
                .setTitle('✅ Countdown complete!')
                .setDescription(
                  'We’ve reached **December 31, 2025, 23:59:59 (Helsinki)**.\n' +
                  'Pauper Liiga year-end mark achieved!'
                )
                .setTimestamp(now),
            ],
            allowedMentions: { roles: [PLAYER_ROLE_ID] },
          });

          // NOTE: This stops *this* cron job from running further
          // (node-cron job instance "this" inside callback)
          // If your linter hates `this`, you can keep a reference outside and stop it there.
          // eslint-disable-next-line no-invalid-this
          this.stop?.();
          return;
        }

        await channel.send({
          content: `<@&${PLAYER_ROLE_ID}>`,
          embeds: [buildEmbed(now)],
          allowedMentions: { roles: [PLAYER_ROLE_ID] },
        });
      } catch (err) {
        console.error('[countdown] Error in cron job:', err);
      }
    },
    { timezone: TZ }
  );

  console.log('[countdown] Weekly countdown scheduled for Mondays 09:00 Europe/Helsinki');
}
