const { Client, GatewayIntentBits, Events } = require("discord.js");
require("dotenv").config();
const { registerFont } = require("canvas");
const fs = require("fs");
const registerCommands = require("./commands");
const deckMatrixHandler = require('./deckMatrixHandler');
const { setupCountdown } = require("./countdown");

// CONFIG
const SHEETDB_URL = process.env.SHEETDB_URL;
const ALLOWED_CHANNEL = process.env.QM_CHANNEL_ID || "1431286082980282530";

// DISCORD CLIENT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// FONT
try {
  const fontPath = "./assets/fonts/NotoSans-Regular.ttf";
  if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: "NotoSans" });
    console.log("✅ Registered font NotoSans-Regular for Deck Matrix");
  } else {
    console.warn("⚠️ Font not found, using default Canvas font");
  }
} catch (err) {
  console.warn("⚠️ Font registration failed:", err.message);
}

// READY
client.on(Events.ClientReady, async () => {
  console.log(`✅ QuarterMaster Online as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(ALLOWED_CHANNEL);
    await ch.send("🟢 QuarterMaster Online (slash commands active).");
  } catch (err) {
    console.error("Boot message failed:", err);
  }

  // start countdown scheduler
  setupCountdown(client);
});

// AUTO DELETE
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== ALLOWED_CHANNEL) return;
  if (!message.interaction && !message.content.startsWith("/")) {
    message.delete().catch(() => {});
  }
});

// MAIN SLASH HANDLERS

// Attach deck matrix handler logic (/deck-matrix)
deckMatrixHandler(client);

// Attach other slash command handlers (/meta, /recent, /topdeck, etc.)
registerCommands(client);

// LOGIN
client.login(process.env.DISCORD_TOKEN);
