const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");
const express = require("express");

const SHEETDB_URL = process.env.SHEETDB_URL; // same DB the league bot uses

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Web server (required for Railway)
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`QuarterMaster online on port ${PORT}`));

// Ready event
client.on("ready", () => {
  console.log(`QuarterMaster reporting for duty — logged in as ${client.user.tag}`);
});

// Handle commands
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(" ");
  const cmd = args.shift().toLowerCase();

  // ======================
  // !deckstats <deck name>
  // ======================
  if (cmd === "!deckstats") {
    const deckName = args.join(" ").trim();
    if (!deckName) {
      return message.channel.send("Please specify a deck name. Example: `!deckstats Jund`");
    }

    const response = await fetch(SHEETDB_URL);
    const matches = await response.json();

    // Filter matches where this deck was P1 or P2
    const gamesWithDeck = matches.filter(
      m => m.P1_deck === deckName || m.P2_deck === deckName
    );

    if (gamesWithDeck.length === 0) {
      return message.channel.send(`No recorded matches for deck **${deckName}**.`);
    }

    let matchesPlayed = gamesWithDeck.length;
    let matchesWon = gamesWithDeck.filter(m => m.Winner_deck === deckName).length;

    let gamesWon = gamesWithDeck.reduce((sum, m) =>
      sum +
      (m.P1_deck === deckName ? Number(m.P1W) : 0) +
      (m.P2_deck === deckName ? Number(m.P2W) : 0),
      0
    );

    let gamesTotal = gamesWithDeck.reduce((sum, m) =>
      sum +
      Number(m.P1W) +
      Number(m.P2W),
      0
    );

    let matchWinPct = ((matchesWon / matchesPlayed) * 100).toFixed(1);
    let gameWinPct = ((gamesWon / gamesTotal) * 100).toFixed(1);

    return message.channel.send(
      `🧙‍♂️ **Deck Stats: ${deckName}**\n\n` +
      `Matches Played: **${matchesPlayed}**\n` +
      `Matches Won: **${matchesWon}** (${matchWinPct}%)\n` +
      `Games Won: **${gamesWon} / ${gamesTotal}** (${gameWinPct}%)\n`
    );
  }
});

// Login (important: use ENV variable!)
client.login(process.env.DISCORD_TOKEN);
