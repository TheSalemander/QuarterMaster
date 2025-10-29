// ==============================
// QuarterMaster Bot (Slash Commands)
// Deck Meta & Analytics Bot
// ==============================


const { Client, GatewayIntentBits, Events } = require("discord.js");
const fetch = require("node-fetch");

// ==============================
// CONFIG
// ==============================
const SHEETDB_URL = process.env.SHEETDB_URL;
const ALLOWED_CHANNEL = process.env.QM_CHANNEL_ID || "1431286082980282530";

// Normalize helper
const norm = (s) => (s || "").trim().toLowerCase();

// ==============================
// DISCORD CLIENT
// ==============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==============================
// READY MESSAGE
// ==============================
client.on(Events.ClientReady, async () => {
  console.log(`✅ QuarterMaster Online as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(ALLOWED_CHANNEL);
    await ch.send("🟢 QuarterMaster Online (slash commands active).");
  } catch (err) {
    console.error("Boot message failed:", err);
  }
});

// ==============================
// AUTO-DELETE NON-SLASH MESSAGES
// ==============================
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== ALLOWED_CHANNEL) return;

  // If a message is NOT a slash command → delete it
  if (!message.interaction && !message.content.startsWith("/")) {
    message.delete().catch(() => {});
  }
});

// ==============================
// SLASH COMMAND HANDLER
// ==============================
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.channelId !== ALLOWED_CHANNEL) {
    return interaction.reply({ content: "❌ This command can only be used in the Meta channel.", ephemeral: true });
  }

  const cmd = interaction.commandName;
  const args = interaction.options;

  const res = await fetch(SHEETDB_URL);
  const rows = (await res.json()).filter(m =>
    m.P1 && m.P2 && m.Winner && m.Winner_Deck &&
    !isNaN(Number(m.P1W)) && !isNaN(Number(m.P2W))
  );

  // ------------------------------
  // /deckstats
  // ------------------------------
  if (cmd === "deckstats") {
    const deck = args.getString("deck");
    const list = rows.filter(m => norm(m.P1_deck) === norm(deck) || norm(m.P2_deck) === norm(deck));

    if (!list.length)
      return interaction.reply(`No matches found for **${deck}**.`);

    const mp = list.length;
    const mw = list.filter(m => norm(m.Winner_Deck) === norm(deck)).length;
    const gw = list.reduce((s,m)=> s + (norm(m.P1_deck)==norm(deck)?Number(m.P1W):Number(m.P2W)), 0);
    const gt = list.reduce((s,m)=> s+Number(m.P1W)+Number(m.P2W),0);

    return interaction.reply(
      `🧙 **Deck Stats: ${deck}**\n\n`+
      `Matches: **${mw}-${mp-mw}** (${((mw/mp)*100).toFixed(1)}% WR)\n`+
      `Games: **${gw}-${gt-gw}** (${((gw/gt)*100).toFixed(1)}% GWR)`
    );
  }

  // ------------------------------
  // /meta
  // ------------------------------
  if (cmd === "meta") {
    const decks = [...new Set(rows.flatMap(m => [m.P1_deck, m.P2_deck]).filter(Boolean))];

    let stats = decks.map(deck => {
      const subset = rows.filter(m => m.P1_deck === deck || m.P2_deck === deck);
      const mp = subset.length;
      const mw = subset.filter(m => norm(m.Winner_Deck) === norm(deck)).length;
      const gw = subset.reduce((s,m)=> s+(norm(m.P1_deck)==norm(deck)?Number(m.P1W):Number(m.P2W)),0);
      const gt = subset.reduce((s,m)=> s+Number(m.P1W)+Number(m.P2W),0);

      return { deck, mp, mwr: mp?((mw/mp)*100).toFixed(1):"0.0", gwr: gt?((gw/gt)*100).toFixed(1):"0.0" };
    }).sort((a,b)=> b.mp - a.mp);

    let reply = "📊 **Current Meta Overview**\n\n";
    stats.forEach(s => reply += `• **${s.deck}** — ${s.mp} matches — ${s.mwr}% match WR — ${s.gwr}% game WR\n`);

    return interaction.reply(reply);
  }

  // ------------------------------
  // /matchups
  // ------------------------------
  if (cmd === "matchups") {
    const deck = args.getString("deck");
    const list = rows.filter(m => norm(m.P1_deck)==norm(deck) || norm(m.P2_deck)==norm(deck));
    if (!list.length) return interaction.reply(`No matches found for **${deck}**.`);

    const vs = new Map();
    for (const m of list) {
      const opp = norm(m.P1_deck)==norm(deck) ? m.P2_deck : m.P1_deck;
      if (!vs.has(opp)) vs.set(opp,{mp:0,mw:0,gw:0,gt:0});
      const r=vs.get(opp);
      r.mp++;
      if (norm(m.Winner_Deck)==norm(deck)) r.mw++;
      r.gw += norm(m.P1_deck)==norm(deck)?Number(m.P1W):Number(m.P2W);
      r.gt += Number(m.P1W)+Number(m.P2W);
    }

    let reply=`📊 **Matchups for ${deck}**\n\n`;
    [...vs.entries()]
      .sort((a,b)=> (b[1].mw/b[1].mp)-(a[1].mw/a[1].mp))
      .forEach(([opp,r])=>{
        const wr=((r.mw/r.mp)*100).toFixed(1);
        const gwr=((r.gw/r.gt)*100).toFixed(1);
        reply+=`• vs **${opp}** — ${r.mw}-${r.mp-r.mw} (${wr}% match WR, ${gwr}% game WR)\n`;
      });

    return interaction.reply(reply);
  }

  // ------------------------------
  // /topdeck
  // ------------------------------
  if (cmd === "topdeck") {
    const deck = args.getString("deck");
    const filtered = rows.filter(m => norm(m.P1_deck)==norm(deck)||norm(m.P2_deck)==norm(deck));
    if(!filtered.length) return interaction.reply(`No match history for **${deck}**.`);

    const players = new Map();
    for(const m of filtered){
      const add = (p, w, gw, gt) => {
        if (!players.has(p)) players.set(p,{mp:0,mw:0,gw:0,gt:0});
        const d = players.get(p);
        d.mp++; d.mw+=w; d.gw+=gw; d.gt+=gt;
      };
      if(norm(m.P1_deck)==norm(deck)) add(m.P1, m.Winner===m.P1?1:0, Number(m.P1W), Number(m.P1W)+Number(m.P2W));
      if(norm(m.P2_deck)==norm(deck)) add(m.P2, m.Winner===m.P2?1:0, Number(m.P2W), Number(m.P1W)+Number(m.P2W));
    }

    const ranking=[...players.entries()]
      .map(([p,d])=>({player:p, mwr:d.mw/d.mp, gwr:d.gw/d.gt, mp:d.mp, mw:d.mw, gw:d.gw, gt:d.gt}))
      .sort((a,b)=> (b.mwr-a.mwr)||(b.gwr-a.gwr)||(b.mp-a.mp))
      .slice(0,3);

    let reply = `🏅 **Top Pilots of ${deck}**\n\n`;
    ranking.forEach((r,i)=> reply+=`${i+1}) **${r.player}** — ${r.mw}-${r.mp-r.mw} (${(r.mwr*100).toFixed(1)}% WR)\n`);
    return interaction.reply(reply);
  }

  // ------------------------------
  // /vs
  // ------------------------------
  if (cmd === "vs") {
    const A = args.getString("deck1");
    const B = args.getString("deck2");
    const set = rows.filter(m =>
      (norm(m.P1_deck)==norm(A)&&norm(m.P2_deck)==norm(B)) ||
      (norm(m.P1_deck)==norm(B)&&norm(m.P2_deck)==norm(A))
    );

    if(!set.length) return interaction.reply(`No matches between **${A}** and **${B}**.`);

    let Aw=0,Bw=0,Ag=0,Bg=0;
    for(const m of set){
      if(norm(m.Winner_Deck)==norm(A)) Aw++; else Bw++;
      Ag+= (norm(m.P1_deck)==norm(A)?Number(m.P1W):Number(m.P2W));
      Bg+= (norm(m.P1_deck)==norm(A)?Number(m.P2W):Number(m.P1W));
    }

    return interaction.reply(
      `⚔️ **${A} vs ${B}**\n\n`+
      `Matches: ${Aw}-${Bw} (${((Aw/(Aw+Bw))*100).toFixed(1)}% WR)\n`+
      `Games: ${Ag}-${Bg} (${((Ag/(Ag+Bg))*100).toFixed(1)}% GWR)`
    );
  }

  // ------------------------------
  // /recent
  // ------------------------------
  if (cmd === "recent") {
    const n = args.getInteger("count") || 5;
    const matches = rows.sort((a,b)=>new Date(b.Date)-new Date(a.Date)).slice(0,n);

    let reply = `🕒 **Recent Matches (last ${matches.length})**\n\n`;
    matches.forEach(m=> reply+=`${m.Winner} (${m.Winner_Deck}) VS. ${m.Loser} (${m.Loser_Deck}) — ${m.P1W}-${m.P2W} *${m.Date}*\n`);
    return interaction.reply(reply);
  }
});

// ------------------------------
// /deck-matrix
// ------------------------------
const { createCanvas, registerFont } = require("canvas");
const fs = require("fs");

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

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "deck-matrix") return;

  await interaction.deferReply();

  try {
    const response = await fetch(`${process.env.SHEETDB_URL}?sheet=Deck_Matchup_Matrix`);
    const matrixRaw = await response.json();

    // 🧹 Clean up data
    const matrix = matrixRaw
      .filter(r => Object.values(r).some(v => v && v.toString().trim() !== ""))
      .map(row => {
        const cleaned = {};
        for (const [key, value] of Object.entries(row)) {
          if (key && key.trim() !== "") cleaned[key.trim()] = (value || "").trim();
        }
        return cleaned;
      });

    if (!matrix.length)
      return interaction.editReply("No Deck Matrix data found or the sheet is empty.");

    const headers = Object.keys(matrix[0]).filter(h => h && h.trim() !== "");
    const rows = matrix.map(r => headers.map(h => r[h] || "-"));

    // Canvas setup
    const cellW = 140;
    const cellH = 45;
    const width = cellW * (headers.length + 1);
    const height = cellH * (rows.length + 1);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Heatmap color helper
    const getHeatColor = (pct) => {
      if (pct === "-" || pct === "" || pct == null) return "#f8f8f8";
      const value = parseInt(pct);
      if (isNaN(value)) return "#f8f8f8";
      const g = Math.round(255 * (value / 100));
      const r = Math.round(255 * (1 - value / 100));
      return `rgb(${r},${g},120)`; // red→green gradient
    };

    // Auto-fit font to cell width
    const fitText = (text, maxWidth, baseSize = 16) => {
      let size = baseSize;
      ctx.font = `bold ${size}px NotoSans`;
      while (ctx.measureText(text).width > maxWidth - 10 && size > 10) {
        size--;
        ctx.font = `bold ${size}px NotoSans`;
      }
    };

    // Header row
    headers.forEach((h, i) => {
      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect((i + 1) * cellW, 0, cellW, cellH);
      ctx.fillStyle = "#ffffff";
      fitText(h, cellW - 10, 18);
      ctx.fillText(h, (i + 1.5) * cellW, cellH / 2);
    });

    // Left column
    headers.forEach((h, i) => {
      ctx.fillStyle = "#00cc44";
      ctx.fillRect(0, (i + 1) * cellH, cellW, cellH);
      ctx.fillStyle = "#ffffff";
      fitText(h, cellW - 10, 18);
      ctx.fillText(h, cellW / 2, (i + 1.5) * cellH);
    });

    // Matrix cells
    rows.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (x === y) {
          ctx.fillStyle = "#cccccc";
        } else {
          const pctMatch = cell.match(/\((\d+)%\)/);
          const pct = pctMatch ? pctMatch[1] : "-";
          ctx.fillStyle = getHeatColor(pct);
        }

        ctx.fillRect((x + 1) * cellW, (y + 1) * cellH, cellW, cellH);
        ctx.strokeStyle = "#00000020";
        ctx.strokeRect((x + 1) * cellW, (y + 1) * cellH, cellW, cellH);

        ctx.fillStyle = "#000000";
        fitText(cell, cellW - 12, 14);
        ctx.fillText(cell, (x + 1.5) * cellW, (y + 1.5) * cellH);
      });
    });

    const filePath = "/tmp/deck_matrix.png";
    fs.writeFileSync(filePath, canvas.toBuffer("image/png"));

    await interaction.editReply({
      content: "📊 **Current Deck Matchup Matrix (Heatmap View)**",
      files: [filePath],
    });

  } catch (err) {
    console.error("❌ Deck Matrix error:", err);
    await interaction.editReply("Error generating Deck Matrix heatmap.");
  }
});


client.login(process.env.DISCORD_TOKEN);
