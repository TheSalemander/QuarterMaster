// deploy-commands.js
require("dotenv").config();
const { REST, Routes } = require("discord.js");
const commands = require("./commands.js");

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("📦 Deploying slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands deployed.");
  } catch (err) {
    console.error("❌ Failed:", err);
  }
})();
