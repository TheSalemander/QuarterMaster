// ==============================
// QuarterMaster Bot
// Deck Meta & Analytics Bot
// ==============================

const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");
const express = require("express");

const SHEETDB_URL = process.env.SHEETDB_URL;
const ALLOWED_CHANNEL = "1431286082980282530";

console.log("[QM] BOOTING BUILD at", new Date().toISOString());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`QuarterMaster online on port ${PORT}`));

client.on("ready", async () => {
  console.log(`QuarterMaster reporting for duty — logged in as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(ALLOWED_CHANNEL);
    await ch.send("🟢 QuarterMaster online (boot check).");
    console.log("[QM] Boot message sent to allowed channel.");
  } catch (err) {
    console.error("[QM] FAILED to send boot message:", err);
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    console.log(`[QM] msg in ${message.channel.id} from ${message.author.tag} | content=`, JSON.stringify(message.content));

    if (message.channel.id !== ALLOWED_CHANNEL) {
      console.log(`[QM] Ignored message in non-allowed channel ${message.channel.id}`);
      return;
    }

    const parts = (message.content || "").trim().split(/\s+/);
    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;

    if (cmd === "!debug") {
      const me = message.guild?.members?.me;
      if (!me) {
        console.log("[QM] No guild member reference (me) available.");
      } else {
        const perms = me.permissionsIn(message.channel);
        console.log("[QM] DEBUG PERMISSIONS:", {
          canView: perms.has("ViewChannel"),
          canSend: perms.has("SendMessages"),
          canReadHistory: perms.has("ReadMessageHistory"),
        });
      }
      return message.channel.send("🔍 Logged permission report to console.")
        .catch(err => console.error("[QM] FAILED TO SEND DEBUG MESSAGE:", err));
    }

    if (cmd === "!test") {
      return message.channel.send("✅ Bot can send messages.")
        .catch(err => console.error("[QM] FAILED TO SEND TEST MESSAGE:", err));
    }

    if (cmd === "!say") {
      const text = args.join(" ") || "(no text)";
      return message.channel.send(`🗣️ ${text}`)
        .catch(err => console.error("[QM] FAILED TO SEND SAY MESSAGE:", err));
    }

    if (cmd === "!deckstats") {
      const deckName = args.join(" ").trim();
      if (!deckName) {
        return message.channel.send("Please specify a deck name. Example: `!deckstats Jund`")
          .catch(err => console.error("[QM] FAILED TO SEND:", err));
      }

      const response = await fetch(SHEETDB_URL);
      const matches = (await response.json()).filter(m =>
        m.P1 && m.P2 && m.Winner && m.Winner_Deck
      );

      const gamesWithDeck = matches.filter(
        m => m.P1_deck === deckName || m.P2_deck === deckName
      );

      if (gamesWithDeck.length === 0) {
        return message.channel.send(`No recorded matches for deck **${deckName}**.`)
          .catch(err => console.error("[QM] FAILED TO SEND:", err));
      }

      const matchesPlayed = gamesWithDeck.length;
      const matchesWon = gamesWithDeck.filter(m => m.Winner_Deck === deckName).length;

      const gamesWon = gamesWithDeck.reduce((sum, m) =>
        sum +
        (m.P1_deck === deckName ? Number(m.P1W) : 0) +
        (m.P2_deck === deckName ? Number(m.P2W) : 0),
        0
      );

      const gamesTotal = gamesWithDeck.reduce((sum, m) =>
        sum + Number(m.P1W) + Number(m.P2W),
        0
      );

      const matchWinPct = ((matchesWon / matchesPlayed) * 100).toFixed(1);
      const gameWinPct = ((gamesWon / gamesTotal) * 100).toFixed(1);

      return message.channel.send(
        `🧙‍♂️ **Deck Stats: ${deckName}**\n\n` +
        `Matches Played: **${matchesPlayed}**\n` +
        `Matches Won: **${matchesWon}** (${matchWinPct}%)\n` +
        `Games Won: **${gamesWon} / ${gamesTotal}** (${gameWinPct}%)`
      ).catch(err => console.error("[QM] FAILED TO SEND:", err));
    }

    if (cmd === "!meta") {
      const response = await fetch(SHEETDB_URL);
      const matches = (await response.json()).filter(m =>
        m.P1 && m.P2 && m.Winner && m.Winner_Deck
      );

      const decks = matches.flatMap(m => [m.P1_deck, m.P2_deck]).filter(Boolean);
      if (decks.length === 0) {
        return message.channel.send("No decks recorded yet.")
          .catch(err => console.error("[QM] FAILED TO SEND:", err));
      }

      const uniqueDecks = [...new Set(decks)];

      let metaStats = uniqueDecks.map(deck => {
        const gamesWithDeck = matches.filter(m => m.P1_deck === deck || m.P2_deck === deck);
        const matchesPlayed = gamesWithDeck.length;
        const matchesWon = gamesWithDeck.filter(m => m.Winner_Deck === deck).length;

        const gamesWon = gamesWithDeck.reduce((sum, m) =>
          sum +
          (m.P1_deck === deck ? Number(m.P1W) : 0) +
          (m.P2_deck === deck ? Number(m.P2W) : 0),
          0
        );

        const gamesTotal = gamesWithDeck.reduce((sum, m) =>
          sum + Number(m.P1W) + Number(m.P2W),
          0
        );

        return {
          deck,
          matchesPlayed,
          matchWinPct: matchesPlayed ? ((matchesWon / matchesPlayed) * 100).toFixed(1) : "0.0",
          gameWinPct: gamesTotal ? ((gamesWon / gamesTotal) * 100).toFixed(1) : "0.0"
        };
      });

      metaStats.sort((a, b) => b.matchesPlayed - a.matchesPlayed);

      let reply = "📊 **Current Meta Overview**\n\n";
      metaStats.forEach(s => {
        reply += `• **${s.deck}** — ${s.matchesPlayed} matches — ${s.matchWinPct}% match WR — ${s.gameWinPct}% game WR\n`;
      });

      return message.channel.send(reply).catch(err => {
        console.error("[QM] FAILED TO SEND META MESSAGE:", err);
      });
    }
  } catch (err) {
    console.error("[QM] Uncaught error in messageCreate:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
