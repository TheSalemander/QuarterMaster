// ==============================
// QuarterMaster Bot
// Deck Meta & Analytics Bot
// ==============================

const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");
const express = require("express");

const SHEETDB_URL = process.env.SHEETDB_URL; // Pulls from Railway env variable

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
// Railway Webserver Requirement
// ==============================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001; // Railway assigns dynamic PORT
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
    const matches = await response.json();

    const gamesWithDeck = matches.filter(
      m => m.P1_deck === deckName || m.P2_deck === deckName
    );

    if (gamesWithDeck.length === 0) {
      return message.channel.send(`No recorded matches for deck **${deckName}**.`);
    }

    let matchesPlayed = gamesWithDeck.length;
    let matchesWon = gamesWithDeck.filt
