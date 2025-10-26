// commands.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = [
  // /deckstats deck:<name>
  new SlashCommandBuilder()
    .setName("deckstats")
    .setDescription("Show performance stats for a specific deck")
    .addStringOption(option =>
      option.setName("deck")
        .setDescription("Deck name")
        .setRequired(true)
    ),

  // /meta
  new SlashCommandBuilder()
    .setName("meta")
    .setDescription("Show the current meta overview"),

  // /matchups deck:<name>
  new SlashCommandBuilder()
    .setName("matchups")
    .setDescription("Show matchup performance for a deck")
    .addStringOption(option =>
      option.setName("deck")
        .setDescription("Deck name")
        .setRequired(true)
    ),

  // /topdeck deck:<name>
  new SlashCommandBuilder()
    .setName("topdeck")
    .setDescription("Show the top pilots of a given deck")
    .addStringOption(option =>
      option.setName("deck")
        .setDescription("Deck name")
        .setRequired(true)
    ),

  // /vs deck1 deck2
  new SlashCommandBuilder()
    .setName("vs")
    .setDescription("Show win/loss record between two decks")
    .addStringOption(option =>
      option.setName("deck1")
        .setDescription("Deck A")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("deck2")
        .setDescription("Deck B")
        .setRequired(true)
    ),

  // /trend deck:<name>
  new SlashCommandBuilder()
    .setName("trend")
    .setDescription("Show weekly performance trend for a deck")
    .addStringOption(option =>
      option.setName("deck")
        .setDescription("Deck name")
        .setRequired(true)
    ),

  // /recent count:<number>
  new SlashCommandBuilder()
    .setName("recent")
    .setDescription("Show the most recent matches")
    .addIntegerOption(option =>
      option.setName("count")
        .setDescription("How many matches to list (default: 5)")
        .setMinValue(1)
        .setMaxValue(20)
    ),
];
