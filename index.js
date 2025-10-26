// ==============================
// QuarterMaster Bot (Slash Commands)
// Deck Meta & Analytics Bot
// ==============================

require("dotenv").config();
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
    return interaction.reply({ content: "❌ This command can only be used in the QuarterMaster channel.", ephemeral: true });
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
    matches.forEach(m=> reply+=`${m.Winner} (${m.Winner_Deck}) def. ${m.Loser} (${m.Loser_Deck}) — ${m.P1W}-${m.P2W} *${m.Date}*\n`);
    return interaction.reply(reply);
  }
});

client.login(process.env.DISCORD_TOKEN);
