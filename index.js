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
// ==============================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`QuarterMaster online on port ${PORT}`));

// ==============================
// Ready Event
// ==============================
client.on("ready", async () => {
  console.log(`QuarterMaster reporting for duty — logged in as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(ALLOWED_CHANNEL);
    await ch.send("🟢 QuarterMaster Online.");
  } catch (err) {
    console.error("[QM] Boot Send Error:", err);
  }
});

// ==============================
// Message Handler
// ==============================
client.on("messageCreate", async (message) => {

  // Auto-delete non-commands in this channel
if (message.channel.id === ALLOWED_CHANNEL && !message.content.startsWith("!")) {
  return message.delete().catch(() => {});
}
  if (message.author.bot) return;
  if (message.channel.id !== ALLOWED_CHANNEL) return;

  console.log(`[QM] MSG from ${message.author.tag}:`, message.content);

  const parts = message.content.trim().split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const args = parts;

  const norm = (s) => (s || "").trim().toLowerCase();

// ------------------------------------------------------
// COMMAND: !deckstats <deck>
// ------------------------------------------------------
if (cmd === "!deckstats") {
  const deckName = args.join(" ").trim();
  if (!deckName)
    return message.channel.send("Usage: `!deckstats <deck>`");

  const res = await fetch(SHEETDB_URL);
  const rows = await res.json();
  const matches = rows.filter(m => m.P1 && m.P2 && m.Winner && m.Winner_Deck);

  const list = matches.filter(m => norm(m.P1_deck) === norm(deckName) || norm(m.P2_deck) === norm(deckName));
  if (!list.length)
    return message.channel.send(`No matches found for deck **${deckName}**.`);

  const mp = list.length;
  const mw = list.filter(m => norm(m.Winner_Deck) === norm(deckName)).length;
  const gw = list.reduce((s,m)=>
    s + (norm(m.P1_deck)==norm(deckName) ? Number(m.P1W):Number(m.P2W)), 0);
  const gt = list.reduce((s,m)=> s+Number(m.P1W)+Number(m.P2W),0);

  return message.channel.send(
    `🧙 **Deck Stats: ${deckName}**\n\n`+
    `Matches: ${mw}-${mp-mw} (${((mw/mp)*100).toFixed(1)}% WR)\n`+
    `Games: ${gw}-${gt-gw} (${((gw/gt)*100).toFixed(1)}% GWR)`
  );
}
// ------------------------------------------------------
// END COMMAND: !deckstats
// ------------------------------------------------------


// ------------------------------------------------------
// COMMAND: !meta
// ------------------------------------------------------
if (cmd === "!meta") {
  const res = await fetch(SHEETDB_URL);
  const matches = (await res.json()).filter(m => m.P1 && m.P2 && m.Winner && m.Winner_Deck);

  const decks = [...new Set(matches.flatMap(m => [m.P1_deck, m.P2_deck]).filter(Boolean))];

  let stats = decks.map(deck => {
    const subset = matches.filter(m => m.P1_deck === deck || m.P2_deck === deck);
    const mp = subset.length;
    const mw = subset.filter(m => norm(m.Winner_Deck) === norm(deck)).length;
    const gw = subset.reduce((s,m)=> s+(norm(m.P1_deck)==norm(deck)?Number(m.P1W):Number(m.P2W)),0);
    const gt = subset.reduce((s,m)=> s+Number(m.P1W)+Number(m.P2W),0);

    return { deck, mp, mw, gw, gt,
      mwr: mp?((mw/mp)*100).toFixed(1):"0.0",
      gwr: gt?((gw/gt)*100).toFixed(1):"0.0",
    };
  }).sort((a,b)=> b.mp - a.mp);

  let reply = "📊 **Current Meta Overview**\n\n";
  stats.forEach(s => reply += `• **${s.deck}** — ${s.mp} matches — ${s.mwr}% match WR — ${s.gwr}% game WR\n`);

  return message.channel.send(reply);
}
// ------------------------------------------------------
// END COMMAND: !meta
// ------------------------------------------------------


// ------------------------------------------------------
// COMMAND: !matchups <deck>
// ------------------------------------------------------
if (cmd === "!matchups") {
  const deckName = args.join(" ").trim();
  if (!deckName) return message.channel.send("Usage: `!matchups <deck>`");

  const res = await fetch(SHEETDB_URL);
  const matches = (await res.json()).filter(m => m.P1 && m.P2);

  const list = matches.filter(m => norm(m.P1_deck)==norm(deckName) || norm(m.P2_deck)==norm(deckName));
  if (!list.length) return message.channel.send(`No matches found for **${deckName}**.`);

  const vs = new Map();
  for (const m of list) {
    const opp = norm(m.P1_deck)==norm(deckName)?m.P2_deck:m.P1_deck;
    if (!vs.has(opp)) vs.set(opp,{mp:0,mw:0,gw:0,gt:0});
    const r=vs.get(opp);
    r.mp++;
    if (norm(m.Winner_Deck)==norm(deckName)) r.mw++;
    const g=(norm(m.P1_deck)==norm(deckName)?Number(m.P1W):Number(m.P2W));
    r.gw+=g;
    r.gt+=Number(m.P1W)+Number(m.P2W);
  }

  let reply=`📊 **Matchups for ${deckName}**\n\n`;
  [...vs.entries()]
    .sort((a,b)=> (b[1].mw/b[1].mp)-(a[1].mw/a[1].mp))
    .forEach(([opp,r])=>{
      const wr=((r.mw/r.mp)*100).toFixed(1);
      const gwr=((r.gw/r.gt)*100).toFixed(1);
      reply+=`• vs **${opp}** — ${r.mw}-${r.mp-r.mw} (${wr}% match WR, ${gwr}% game WR)\n`;
    });

  return message.channel.send(reply);
}
// ------------------------------------------------------
// END COMMAND: !matchups
// ------------------------------------------------------

// ------------------------------------------------------
// COMMAND: !bestdecks <player>
// Shows how well a player performs on each deck they played.
// ------------------------------------------------------
if (cmd === "!bestdecks") {
  const player = args.join(" ").trim();
  if (!player) return message.channel.send("Usage: `!bestdecks <player>`");

  const res = await fetch(SHEETDB_URL);
  const matches = (await res.json()).filter(m =>
    m.P1 && m.P2 && m.Winner && m.Winner_Deck
  );

  const playerMatches = matches.filter(m =>
    norm(m.P1) === norm(player) || norm(m.P2) === norm(player)
  );

  if (!playerMatches.length)
    return message.channel.send(`No match history found for **${player}**.`);

  const decks = new Map();

  for (const m of playerMatches) {
    let deckUsed, gamesWon, gamesTotal, winMatch;

    if (norm(m.P1) === norm(player)) {
      deckUsed = m.P1_deck;
      gamesWon = Number(m.P1W);
      gamesTotal = Number(m.P1W) + Number(m.P2W);
      winMatch = norm(m.Winner) === norm(player);
    } else {
      deckUsed = m.P2_deck;
      gamesWon = Number(m.P2W);
      gamesTotal = Number(m.P1W) + Number(m.P2W);
      winMatch = norm(m.Winner) === norm(player);
    }

    if (!decks.has(deckUsed)) decks.set(deckUsed, { mp:0, mw:0, gw:0, gt:0 });
    const d = decks.get(deckUsed);
    d.mp++;
    if (winMatch) d.mw++;
    d.gw += gamesWon;
    d.gt += gamesTotal;
  }

  const standings = [...decks.entries()]
    .map(([deck, d]) => ({
      deck,
      mp: d.mp,
      mw: d.mw,
      gw: d.gw,
      gt: d.gt,
      mwr: ((d.mw / d.mp) * 100).toFixed(1),
      gwr: ((d.gw / d.gt) * 100).toFixed(1)
    }))
    .sort((a, b) => b.mw / b.mp - a.mw / a.mp || b.gw / b.gt - a.gw / a.gt);

  let reply = `🎭 **Best Decks for ${player}**\n\n`;
  standings.forEach(s => {
    reply += `• **${s.deck}** — ${s.mw}-${s.mp - s.mw} (${s.mwr}% match WR) — ${s.gw}-${s.gt - s.gw} games (${s.gwr}% GWR)\n`;
  });

  return message.channel.send(reply);
}
// ------------------------------------------------------
// END COMMAND: !bestdecks
// ------------------------------------------------------


  
// ------------------------------------------------------
// COMMAND: !topdeck <deck>
// ------------------------------------------------------
if (cmd === "!topdeck") {
  const deckName = args.join(" ").trim();
  if (!deckName) return message.channel.send("Usage: `!topdeck <deck>`");

  const res = await fetch(SHEETDB_URL);
  const rows = await res.json();

  // Strict filter: exclude placeholder rows and ensure numbers are valid
  const matches = rows.filter(m =>
    m.P1 && m.P2 &&
    m.P1 !== "-" && m.P2 !== "-" &&
    m.P1_deck && m.P2_deck &&
    m.P1_deck !== "-" && m.P2_deck !== "-" &&
    m.Winner && m.Winner !== "-" &&
    m.Winner_Deck && m.Winner_Deck !== "-" &&
    !isNaN(Number(m.P1W)) &&
    !isNaN(Number(m.P2W))
  );

  const n = (s) => (s || "").trim().toLowerCase();

  // Only matches where the requested deck was used
  const filtered = matches.filter(m =>
    n(m.P1_deck) === n(deckName) || n(m.P2_deck) === n(deckName)
  );

  if (!filtered.length)
    return message.channel.send(`No match history for deck **${deckName}**.`);

  // Aggregate per-player performance when they were piloting the deck
  const players = new Map();

  for (const m of filtered) {
    const p1Used = n(m.P1_deck) === n(deckName);
    const p2Used = n(m.P2_deck) === n(deckName);

    if (p1Used) {
      if (!players.has(m.P1)) players.set(m.P1, { mp: 0, mw: 0, gw: 0, gt: 0 });
      const p = players.get(m.P1);
      p.mp += 1;
      if (m.Winner === m.P1) p.mw += 1;                  // ✅ win credited to the pilot
      p.gw += Number(m.P1W);
      p.gt += Number(m.P1W) + Number(m.P2W);
    }

    if (p2Used) {
      if (!players.has(m.P2)) players.set(m.P2, { mp: 0, mw: 0, gw: 0, gt: 0 });
      const p = players.get(m.P2);
      p.mp += 1;
      if (m.Winner === m.P2) p.mw += 1;                  // ✅ win credited to the pilot
      p.gw += Number(m.P2W);
      p.gt += Number(m.P1W) + Number(m.P2W);
    }
  }

  // Rank: match WR desc, then game WR desc, then matches played desc
  const ranking = [...players.entries()]
    .map(([player, d]) => ({
      player,
      mp: d.mp,
      mw: d.mw,
      gw: d.gw,
      gt: d.gt,
      mwr: d.mp ? (d.mw / d.mp) : 0,
      gwr: d.gt ? (d.gw / d.gt) : 0
    }))
    .sort((a, b) =>
      (b.mwr - a.mwr) || (b.gwr - a.gwr) || (b.mp - a.mp)
    )
    .slice(0, 3);

  if (!ranking.length)
    return message.channel.send(`No valid results for **${deckName}** yet.`);

  let reply = `🏅 **Top ${Math.min(3, ranking.length)} Pilots of ${deckName}**\n\n`;
  ranking.forEach((r, i) => {
    reply += `${i + 1}) **${r.player}** — ${r.mw}-${r.mp - r.mw} `
          + `(${(r.mwr * 100).toFixed(1)}% match WR) — `
          + `${r.gw}-${r.gt - r.gw} games `
          + `(${(r.gwr * 100).toFixed(1)}% GWR)\n`;
  });

  return message.channel.send(reply);
}
// ------------------------------------------------------
// END COMMAND: !topdeck
// ------------------------------------------------------


// ------------------------------------------------------
// COMMAND: !vs <deckA> vs <deckB>
// ------------------------------------------------------
if (cmd === "!vs") {
  const text = args.join(" ");
  const split = text.split(/vs|,|v/i).map(s => s.trim()).filter(Boolean);
  if (split.length !== 2) return message.channel.send("Usage: `!vs DeckA vs DeckB`");

  const [A,B]=split.map(s=>s.trim());
  const res = await fetch(SHEETDB_URL);
  const matches = await res.json();

  const relevant = matches.filter(m =>
    (norm(m.P1_deck)==norm(A)&&norm(m.P2_deck)==norm(B)) ||
    (norm(m.P1_deck)==norm(B)&&norm(m.P2_deck)==norm(A))
  );

  if(!relevant.length) return message.channel.send(`No matches between **${A}** and **${B}**.`);

  let Aw=0, Bw=0, Ag=0, Bg=0;
  for(const m of relevant){
    if(norm(m.Winner_Deck)==norm(A)) Aw++; else Bw++;
    Ag+= (norm(m.P1_deck)==norm(A)?Number(m.P1W):Number(m.P2W));
    Bg+= (norm(m.P1_deck)==norm(A)?Number(m.P2W):Number(m.P1W));
  }

  const matchWR=((Aw/(Aw+Bw))*100).toFixed(1);
  const gameWR=((Ag/(Ag+Bg))*100).toFixed(1);

  return message.channel.send(
    `⚔️ **${A} vs ${B}**\n\n`+
    `Matches: ${Aw}-${Bw} (${matchWR}% WR)\n`+
    `Games: ${Ag}-${Bg} (${gameWR}% GWR)`
  );
}
// ------------------------------------------------------
// END COMMAND: !vs
// ------------------------------------------------------


// ------------------------------------------------------
// COMMAND: !trend <deck>  (uses YYYY-MM-DD dates)
// ------------------------------------------------------
if (cmd === "!trend") {
  const deck = args.join(" ").trim();
  if(!deck) return message.channel.send("Usage: `!trend <deck>`");

  const res = await fetch(SHEETDB_URL);
  const rows = await res.json();
  const list = rows.filter(m=>m.P1&&m.P2&&m.Winner&&m.Winner_Deck&&m.Date);

  const games = list.filter(m=> norm(m.P1_deck)==norm(deck)||norm(m.P2_deck)==norm(deck));
  if(!games.length) return message.channel.send(`No matches found for **${deck}**.`);

  const weekStart = (d)=>{ d=new Date(d); const day=d.getDay(); const diff=(day===0?-6:1-day); d.setDate(d.getDate()+diff); d.setHours(0,0,0,0); return d.getTime(); };

  const weekly=new Map();
  for(const m of games){
    const w=weekStart(new Date(m.Date));
    if(!weekly.has(w)) weekly.set(w,{mp:0,mw:0});
    const r=weekly.get(w);
    r.mp++;
    if(norm(m.Winner_Deck)==norm(deck)) r.mw++;
  }

  let reply = `📈 **Performance Trend for ${deck}**\n\n`;
  [...weekly.entries()].sort((a,b)=>a[0]-b[0]).forEach(([wk,r])=>{
    const d=new Date(wk);
    const label=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const wr=((r.mw/r.mp)*100).toFixed(1);
    reply+=`• Week of ${label} — ${r.mw}-${r.mp-r.mw} (${wr}% WR)\n`;
  });

  return message.channel.send(reply);
}
// ------------------------------------------------------
// END COMMAND: !trend
// ------------------------------------------------------


// ------------------------------------------------------
// COMMAND: !recent <n>
// ------------------------------------------------------
if(cmd==="!recent"){
  const n = Number(args[0])||5;
  const res = await fetch(SHEETDB_URL);
  const rows = await res.json();
  const matches = rows.filter(m=>m.P1&&m.P2&&m.Winner&&m.Winner_Deck&&m.Date)
                      .sort((a,b)=>new Date(b.Date)-new Date(a.Date))
                      .slice(0,n);

  let reply = `🕒 **Recent Matches (last ${matches.length})**\n\n`;
  matches.forEach(m=>{
    reply+=`${m.Winner} (${m.Winner_Deck}) def. ${m.Loser} (${m.Loser_Deck||"?"}) — ${m.P1W}-${m.P2W}  *${m.Date}*\n`;
  });

  return message.channel.send(reply);
}
// ------------------------------------------------------
// END COMMAND: !recent
// ------------------------------------------------------

});

// ==============================
// Login
// ==============================
client.login(process.env.DISCORD_TOKEN);
