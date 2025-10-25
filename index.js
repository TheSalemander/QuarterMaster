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
const SHEETDB_URL = process.env.SHEETDB_URL; 
const ALLOWED_CHANNEL = "1431286082980282530"; 

console.log("[QM] BOOTING at", new Date().toISOString());

// ==============================
// Discord Client Initialization
// ==============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ==============================
// Railway Web Server Requirement
// ============================
