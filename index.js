// ==============================
// QuarterMaster Bot
// Deck Meta & Analytics Bot
// ==============================

const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");
const express = require("express");

// ==============================
// Config
// ==============================
const SHEETDB_URL = process.env.SHEETDB_URL; // SheetDB League Data Source
const ALLOWED_CHANNEL = "1431286082980282530"; // <-- Meta channel ID

// ==============================
// Discord Client Initialization
// ==============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,  // <-- requires portal toggle
    GatewayIntentBits.GuildMembers     // <-- for accurate permission checks
  ]
});

// ==============================
// Railway Web Server Requirement
// ==============================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`QuarterMaster online on port ${PORT}`));

// ==============================
// Bot Ready Event
// ==============================
client.on("ready", () => {
  console.log(`QuarterMaster reporting for duty — logged in as ${client.user.tag}`);
});

// ==============================
// Command Handler
// ==============================
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    // DEBUG: see exactly what we received
    console.log(`[QM] msg in ${message.channel.id} | content=`, JSON.stringify(message.content));

    // ✅ Only respond in the Meta channel
    if (message.channel.id !== ALLOWED_CHANNEL) return;

    const parts = (message.content || "").trim().split(/\s+/);
    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;

    // ======================================================
    // DEBUG: !debug — print effective perms to logs
    // ======================================================
    if (cmd === "!debug") {
      const me = message.guild?.members?.me;
      if (!me) {
        console.log("[QM] No guild member reference (me) available.");
      } else {
        const perms = me.permissionsIn(message.channel);
        console.log("DEBUG PERMISSIONS:", {
          canView: perms.has("ViewChannel"),
          canSend: perms.has("SendMessages"),
          canReadHistory: perms.has("ReadMessageHistory"),
        });
      }
      return message.channel.send("🔍 Logged permission report to console.")
        .catch(err => console.error("FAILED TO SEND DEBUG MESSAGE:", err));
    }

    // ======================================================
    // DEBUG: !test — quick send test
    // ======================================================
    if (cmd === "!test") {
      return message.channel.send("✅ Bot can send messages.")
        .catch(err => console.error("FAILED TO SEND TEST MESSAGE:", err));
    }

    // ======================================================
    // !deckstats <deck name>
    // ======================================================
    if (cmd === "!deckstats") {
      const deckName = args.join(" ").trim();
      if (!deckName) {
        return message.channel.send("Please specify a deck name. Example: `!deckstats Jund`")
          .catch(err => console.error("FAILED TO SEND:", err));
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
          .catch(err => console.error("FAILED TO SEND:", err));
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
      ).catch(err => console.error("FAILED TO SEND:", err));
    }

    // ======================================================
    // !meta — Meta Overview
    // ======================================================
    if (cmd === "!meta") {
      const response = await fetch(SHEETDB_URL);
      const matches = (await response.json()).filter(m =>
        m.P1 && m.P2 && m.Winner && m.Winner_Deck
      );

      const decks = matches.flatMap(m => [m.P1_deck, m.P2_deck]).filter(Boolean);
      if (decks.length === 0) {
        return message.channel.send("No decks recorded yet.")
          .catch(err => console.error("FAILED TO SEND:", err));
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
        console.error("FAILED TO SEND META MESSAGE:", err);
      });
    }
  } catch (err) {
    console.error("[QM] Uncaught error in messageCreate:", err);
  }
});

// ==============================
// Bot Login
// ==============================
client.login(process.env.DISCORD_TOKEN);
