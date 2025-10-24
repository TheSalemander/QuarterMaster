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
    GatewayIntentBits.MessageContent
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
  if (message.author.bot) return;

  if (cmd === "!test") {
  return message.channel.send("✅ QuarterMaster CAN send messages here.");
}

  // ✅ Only respond in the Meta channel
  if (message.channel.id !== ALLOWED_CHANNEL) return;

  const args = message.content.trim().split(" ");
  const cmd = args.shift().toLowerCase();

  // ======================================================
  // COMMAND: !deckstats <deck name>
  // Shows match & game performance for a specific deck
  // ======================================================
  if (cmd === "!deckstats") {
    const deckName = args.join(" ").trim();
    if (!deckName) {
      return message.channel.send("Please specify a deck name. Example: `!deckstats Jund`");
    }

   const response = await fetch(SHEETDB_URL);
const matches = (await response.json()).filter(m =>
  m.P1 && m.P2 && m.Winner && m.Winner_Deck
);

    const gamesWithDeck = matches.filter(
      m => m.P1_deck === deckName || m.P2_deck === deckName
    );

    if (gamesWithDeck.length === 0) {
      return message.channel.send(`No recorded matches for deck **${deckName}**.`);
    }

    let matchesPlayed = gamesWithDeck.length;
    let matchesWon = gamesWithDeck.filter(m => m.Winner_Deck === deckName).length;

    let gamesWon = gamesWithDeck.reduce((sum, m) =>
      sum +
      (m.P1_deck === deckName ? Number(m.P1W) : 0) +
      (m.P2_deck === deckName ? Number(m.P2W) : 0),
      0
    );

    let gamesTotal = gamesWithDeck.reduce((sum, m) =>
      sum + Number(m.P1W) + Number(m.P2W),
      0
    );

    let matchWinPct = ((matchesWon / matchesPlayed) * 100).toFixed(1);
    let gameWinPct = ((gamesWon / gamesTotal) * 100).toFixed(1);

    return message.channel.send(
      `🧙‍♂️ **Deck Stats: ${deckName}**\n\n` +
      `Matches Played: **${matchesPlayed}**\n` +
      `Matches Won: **${matchesWon}** (${matchWinPct}%)\n` +
      `Games Won: **${gamesWon} / ${gamesTotal}** (${gameWinPct}%)`
    );
  }

  // ======================================================
  // COMMAND: !meta
  // Shows deck usage & win rates across all matches
  // ======================================================
  if (cmd === "!meta") {
    const response = await fetch(SHEETDB_URL);
    const matches = (await response.json()).filter(m =>
  m.P1 && m.P2 && m.Winner && m.Winner_Deck
);
    const decks = matches.flatMap(m => [m.P1_deck, m.P2_deck]).filter(Boolean);
    if (decks.length === 0) {
      return message.channel.send("No decks recorded yet.");
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

    return message.channel.send(reply);
  }
});

// ==============================
// Bot Login
// ==============================
client.login(process.env.DISCORD_TOKEN);
