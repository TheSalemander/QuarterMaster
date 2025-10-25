// ==============================
// QuarterMaster Bot
// Deck Meta & Analytics Bot
// ==============================

const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");
const express = require("express");

const SHEETDB_URL = process.env.SHEETDB_URL;
const ALLOWED_CHANNEL = "1431286082980282530";

console.log("[QM] BOOTING BUILD at", new Date().toISOString());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ==============================
// Web Server (Railway Requirement)
// ==============================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`QuarterMaster online on port ${PORT}`));

// ==============================
// READY EVENT
// ==============================
client.on("ready", async () => {
  console.log(`QuarterMaster reporting for duty — logged in as ${client.user.tag}`);
  try {
    const ch = await client.channels.fetch(ALLOWED_CHANNEL);
    await ch.send("🟢 QuarterMaster online (boot check).");
    console.log("[QM] Boot message sent to allowed channel.");
  } catch (err) {
    console.error("[QM] FAILED to send boot message:", err);
  }
});

// ==============================
// MESSAGE HANDLER
// ==============================
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    console.log(`[QM] msg in ${message.channel.id} from ${message.author.tag} | content=`, JSON.stringify(message.content));

    if (message.channel.id !== ALLOWED_CHANNEL) return;

    const parts = (message.content || "").trim().split(/\s+/);
    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;

    // ------------------------------------------------------
    // COMMAND BLOCK: !debug
    // ------------------------------------------------------
    if (cmd === "!debug") {
      const me = message.guild?.members?.me;
      if (me) {
        const perms = me.permissionsIn(message.channel);
        console.log("[QM] DEBUG PERMISSIONS:", {
          canView: perms.has("ViewChannel"),
          canSend: perms.has("SendMessages"),
          canReadHistory: perms.has("ReadMessageHistory"),
        });
      }
      return message.channel.send("🔍 Logged permission report to console.")
        .catch(err => console.error("[QM] FAILED TO SEND DEBUG MESSAGE:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !debug
    // ------------------------------------------------------


    // ------------------------------------------------------
    // COMMAND BLOCK: !test
    // ------------------------------------------------------
    if (cmd === "!test") {
      return message.channel.send("✅ Bot can send messages.")
        .catch(err => console.error("[QM] FAILED TO SEND TEST MESSAGE:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !test
    // ------------------------------------------------------


    // ------------------------------------------------------
    // COMMAND BLOCK: !say <text>
    // ------------------------------------------------------
    if (cmd === "!say") {
      const text = args.join(" ") || "(no text)";
      return message.channel.send(`🗣️ ${text}`)
        .catch(err => console.error("[QM] FAILED TO SEND SAY MESSAGE:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !say
    // ------------------------------------------------------

    // ------------------------------------------------------
// COMMAND BLOCK: !trend <deck>
// Shows weekly match win-rate progression for a deck
// ------------------------------------------------------
if (cmd === "!trend") {
  const raw = args.join(" ").trim();
  if (!raw) {
    return message.channel.send("Please specify a deck name. Example: `!trend U-Terror`")
      .catch(err => console.error("[QM] FAILED TO SEND:", err));
  }

  const norm = (s) => (s || "").trim().toLowerCase();
  const deckKey = norm(raw);

  const res = await fetch(SHEETDB_URL);
  const rows = await res.json();
  const matches = rows.filter(m =>
    m.P1 && m.P2 && m.Winner && m.Winner_Deck && m.Date
  );

  const involving = matches.filter(
    m => norm(m.P1_deck) === deckKey || norm(m.P2_deck) === deckKey
  );

  if (!involving.length) {
    return message.channel.send(`No matches found for deck **${raw}**.`)
      .catch(err => console.error("[QM] FAILED:", err));
  }

  // ✅ ISO DATE PARSER (YYYY-MM-DD)
  const parseISODate = (d) => new Date(d);

  // Grouping to Monday of that week
  const weekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
  };

  const weekly = new Map();

  for (const m of involving) {
    const date = parseISODate(m.Date);
    const wk = weekStart(date).getTime();
    if (!weekly.has(wk)) weekly.set(wk, { matches: 0, wins: 0 });
    const rec = weekly.get(wk);
    rec.matches++;
    if (norm(m.Winner_Deck) === deckKey) rec.wins++;
  }

  const timeline = [...weekly.entries()]
    .sort((a,b) => a[0] - b[0])
    .map(([wk, r]) => {
      const d = new Date(wk);
      const label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const wr = ((r.wins / r.matches) * 100).toFixed(1);
      return { label, record: `${r.wins}-${r.matches - r.wins}`, wr };
    });

  let reply = `📈 **Performance Trend for ${raw}**\n\n`;
  timeline.forEach(t => {
    const tag = t.wr >= 60 ? "🔥" : t.wr >= 50 ? "✅" : t.wr >= 40 ? "⚖️" : "🔻";
    reply += `• **Week of ${t.label}** — ${t.record} (${t.wr}% WR) ${tag}\n`;
  });

  return message.channel.send(reply)
    .catch(err => console.error("[QM] FAILED TO SEND TREND MESSAGE:", err));
}
// ------------------------------------------------------
// END COMMAND BLOCK: !trend
// ------------------------------------------------------

    // ------------------------------------------------------
    // COMMAND BLOCK: !vs <deckA> <deckB>
    // Head-to-head comparison between two decks
    // ------------------------------------------------------
    if (cmd === "!vs") {
      const text = args.join(" ").trim();
      const split = text.split(/ +vs +| +v +|,/i).map(s => s.trim()).filter(Boolean);

      if (split.length !== 2) {
        return message.channel.send(
          "Usage: `!vs DeckA vs DeckB`\nExample: `!vs U-Terror vs BR-Burn`"
        ).catch(err => console.error("[QM] FAILED TO SEND:", err));
      }

      const [deckA, deckB] = split;
      const norm = s => (s || "").toLowerCase().trim();

      const res = await fetch(SHEETDB_URL);
      const rows = await res.json();
      const matches = rows.filter(m => m.P1 && m.P2 && m.Winner && m.Winner_Deck);

      const relevant = matches.filter(m =>
        (norm(m.P1_deck) === norm(deckA) && norm(m.P2_deck) === norm(deckB)) ||
        (norm(m.P1_deck) === norm(deckB) && norm(m.P2_deck) === norm(deckA))
      );

      if (!relevant.length) {
        return message.channel.send(`No matches found between **${deckA}** and **${deckB}**.`)
          .catch(err => console.error("[QM] FAILED:", err));
      }

      let matchesA = 0, matchesB = 0;
      let gamesA = 0, gamesB = 0;

      for (const m of relevant) {
        const a_is_p1 = norm(m.P1_deck) === norm(deckA);
        const aGames = a_is_p1 ? Number(m.P1W) : Number(m.P2W);
        const bGames = a_is_p1 ? Number(m.P2W) : Number(m.P1W);

        gamesA += aGames;
        gamesB += bGames;

        if (norm(m.Winner_Deck) === norm(deckA)) matchesA++;
        else matchesB++;
      }

      const matchWR = ((matchesA / (matchesA + matchesB)) * 100).toFixed(1);
      const gameWR = ((gamesA / (gamesA + gamesB)) * 100).toFixed(1);

      const emoji = matchWR >= 60 ? "🔥"
                 : matchWR >= 50 ? "✅"
                 : matchWR >= 40 ? "⚖️"
                 : "🔻";

      return message.channel.send(
        `⚔️ **${deckA} vs ${deckB}**\n\n` +
        `Matches: **${matchesA}-${matchesB}** (${matchWR}% WR) ${emoji}\n` +
        `Games: **${gamesA}-${gamesB}** (${gameWR}% game WR)`
      ).catch(err => console.error("[QM] FAILED TO SEND VS MESSAGE:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !vs
    // ------------------------------------------------------

        // ------------------------------------------------------
    // COMMAND BLOCK: !recent <n>
    // Shows the last N matches played (default 5)
    // ------------------------------------------------------
    if (cmd === "!recent") {
      const n = Number(args[0]) || 5; // default to 5 if no number provided

      const res = await fetch(SHEETDB_URL);
      const rows = await res.json();

      // Filter valid match rows
      const matches = rows.filter(m =>
        m.P1 && m.P2 && m.P1W && m.P2W && m.Winner && m.Winner_Deck && m.Date
      );

      if (!matches.length) {
        return message.channel.send("No matches recorded yet.")
          .catch(err => console.error("[QM] FAILED TO SEND:", err));
      }

      // Sort newest → oldest using the ISO date format
      matches.sort((a, b) => new Date(b.Date) - new Date(a.Date));

      const slice = matches.slice(0, n);

      let reply = `🕒 **Recent Matches (last ${slice.length})**\n\n`;

      for (const m of slice) {
        reply += `${m.Winner} **(${m.Winner_Deck})** def. ` +
                 `${m.Loser} (${m.Loser_Deck || "?"}) — ` +
                 `${m.P1W}-${m.P2W} ` +
                 `*(${m.Date})*\n`;
      }

      return message.channel.send(reply)
        .catch(err => console.error("[QM] FAILED TO SEND RECENT MESSAGE:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !recent
    // ------------------------------------------------------


    // ------------------------------------------------------
    // COMMAND BLOCK: !deckstats <deck>
    // ------------------------------------------------------
    if (cmd === "!deckstats") {
      const deckName = args.join(" ").trim();
      if (!deckName) {
        return message.channel.send("Please specify a deck name. Example: `!deckstats Jund`")
          .catch(err => console.error("[QM] FAILED TO SEND:", err));
      }

      const response = await fetch(SHEETDB_URL);
      const matches = (await response.json()).filter(m =>
        m.P1 && m.P2 && m.Winner && m.Winner_Deck
      );

      const gamesWithDeck = matches.filter(
        m => m.P1_deck === deckName || m.P2_deck === deckName
      );

      if (gamesWithDeck.length === 0) {
        return message.channel.send(`No recorded matches for deck **${deckName}**.`)
          .catch(err => console.error("[QM] FAILED TO SEND:", err));
      }

      const matchesPlayed = gamesWithDeck.length;
      const matchesWon = gamesWithDeck.filter(m => m.Winner_Deck === deckName).length;

      const gamesWon = gamesWithDeck.reduce((sum, m) =>
        sum +
        (m.P1_deck === deckName ? Number(m.P1W) : 0) +
        (m.P2_deck === deckName ? Number(m.P2W) : 0),
        0
      );

      const gamesTotal = gamesWithDeck.reduce((sum, m) =>
        sum + Number(m.P1W) + Number(m.P2W),
        0
      );

      return message.channel.send(
        `🧙‍♂️ **Deck Stats: ${deckName}**\n\n` +
        `Matches Played: **${matchesPlayed}**\n` +
        `Matches Won: **${matchesWon}**\n` +
        `Games Won: **${gamesWon} / ${gamesTotal}**`
      ).catch(err => console.error("[QM] FAILED TO SEND:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !deckstats
    // ------------------------------------------------------


    // ------------------------------------------------------
    // COMMAND BLOCK: !meta
    // ------------------------------------------------------
    if (cmd === "!meta") {
      const response = await fetch(SHEETDB_URL);
      const matches = (await response.json()).filter(m =>
        m.P1 && m.P2 && m.Winner && m.Winner_Deck
      );

      const decks = matches.flatMap(m => [m.P1_deck, m.P2_deck]).filter(Boolean);
      const uniqueDecks = [...new Set(decks)];

      let meta = uniqueDecks.map(deck => {
        const subset = matches.filter(m => m.P1_deck === deck || m.P2_deck === deck);
        const mp = subset.length;
        const mw = subset.filter(m => m.Winner_Deck === deck).length;
        const gw = subset.reduce((s, m) => s + (m.P1_deck === deck ? Number(m.P1W) : Number(m.P2W)), 0);
        const gt = subset.reduce((s, m) => s + Number(m.P1W) + Number(m.P2W), 0);

        return {
          deck,
          mp,
          matchWR: mp ? ((mw / mp) * 100).toFixed(1) : "0.0",
          gameWR: gt ? ((gw / gt) * 100).toFixed(1) : "0.0"
        };
      });

      meta.sort((a, b) => b.mp - a.mp);

      let reply = "📊 **Current Meta Overview**\n\n";
      meta.forEach(s => {
        reply += `• **${s.deck}** — ${s.mp} matches — ${s.matchWR}% match WR — ${s.gameWR}% game WR\n`;
      });

      return message.channel.send(reply)
        .catch(err => console.error("[QM] FAILED TO SEND META:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !meta
    // ------------------------------------------------------


    // ------------------------------------------------------
    // COMMAND BLOCK: !matchups <deck>
    // ------------------------------------------------------
    if (cmd === "!matchups") {
      const raw = args.join(" ").trim();
      if (!raw) {
        return message.channel.send("Please specify a deck name. Example: `!matchups U-Terror`")
          .catch(err => console.error("[QM] FAILED:", err));
      }

      const norm = (s) => (s || "").trim().toLowerCase();
      const deckKey = norm(raw);

      const res = await fetch(SHEETDB_URL);
      const rows = await res.json();
      const matches = rows.filter(m => m.P1 && m.P2 && m.Winner && m.Winner_Deck);

      const involving = matches.filter(
        m => norm(m.P1_deck) === deckKey || norm(m.P2_deck) === deckKey
      );

      if (!involving.length) {
        return message.channel.send(`No matches found for deck **${raw}**.`)
          .catch(err => console.error("[QM] FAILED:", err));
      }

      const vs = new Map();
      for (const m of involving) {
        const opp = norm(m.P1_deck) === deckKey ? m.P2_deck : m.P1_deck;
        if (!opp) continue;
        if (!vs.has(opp)) vs.set(opp, { matches: 0, wins: 0, gw: 0, gt: 0 });

        const rec = vs.get(opp);
        rec.matches++;
        if (norm(m.Winner_Deck) === deckKey) rec.wins++;

        const gw = (norm(m.P1_deck) === deckKey ? Number(m.P1W) : Number(m.P2W));
        const gt = Number(m.P1W) + Number(m.P2W);
        rec.gw += gw;
        rec.gt += gt;
      }

      const table = [...vs.entries()].map(([opp, r]) => {
        return {
          opp,
          record: `${r.wins}-${r.matches - r.wins}`,
          mw: r.matches ? ((r.wins / r.matches) * 100).toFixed(1) : "0.0",
          gw: r.gt ? ((r.gw / r.gt) * 100).toFixed(1) : "0.0",
          matches: r.matches
        };
      }).sort((a, b) => b.mw - a.mw || b.matches - a.matches || a.opp.localeCompare(b.opp));

      let reply = `📊 **Matchups for ${raw}**\n\n`;
      table.forEach(r => {
        const tag = r.mw >= 60 ? "🔥" : r.mw >= 50 ? "✅" : r.mw >= 40 ? "⚖️" : "🔻";
        reply += `• vs **${r.opp}** — ${r.record} (${r.mw}% match WR, ${r.gw}% game WR) ${tag}\n`;
      });

      return message.channel.send(reply)
        .catch(err => console.error("[QM] FAILED TO SEND MATCHUPS:", err));
    }
    // ------------------------------------------------------
    // END COMMAND BLOCK: !matchups
    // ------------------------------------------------------

  } catch (err) {
    console.error("[QM] Uncaught error in messageCreate:", err);
  }
});

// ==============================
// LOGIN
// ==============================
client.login(process.env.DISCORD_TOKEN);
