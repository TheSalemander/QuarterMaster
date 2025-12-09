// statCommandsHandler.js
const { Events, EmbedBuilder } = require("discord.js");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const SHEETDB_URL = process.env.SHEETDB_URL; // matches your env var in Railway

function norm(str) {
  return (str || "").trim().toLowerCase();
}

function getRows(raw) {
  const rows = Array.isArray(raw) ? raw : raw.data;
  if (!Array.isArray(rows)) throw new Error("Unexpected SheetDB response format");

  // 🔹 Normalize keys + trim string values
  return rows.map((row) => {
    const cleaned = {};
    for (const [key, value] of Object.entries(row)) {
      if (!key) continue;
      const k = key.trim();                 // remove trailing / leading spaces
      cleaned[k] = typeof value === "string" ? value.trim() : value;
    }
    return cleaned;
  });
}


function ensureDeck(map, key, label) {
  if (!key) return null;
  if (!map.has(key)) {
    map.set(key, {
      name: label || key,
      matches: 0,
      wins: 0,
      losses: 0,
    });
  }
  return map.get(key);
}

module.exports = function attachStatCommands(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    // Only handle these here; /deck-matrix is handled in deckMatrixHandler.js
    if (!["meta", "deckstats", "matchups", "topdeck", "vs", "trend", "recent"].includes(cmd)) {
      return;
    }

    if (!SHEETDB_URL) {
      return interaction.reply({
        content: "❌ SHEETDB_URL is not configured on the bot.",
        ephemeral: true,
      });
    }

    try {
      await interaction.deferReply();
    } catch {
      // ignore if already deferred / replied
    }

    try {
      const res = await fetch(SHEETDB_URL);
      const raw = await res.json();
      const rows = getRows(raw);

      switch (cmd) {
        case "recent": {
          const countOpt = interaction.options.getInteger("count");
          const count = countOpt ?? 5;
          const last = rows.slice(-count);

          if (!last.length) {
            await interaction.editReply("⚠️ No matches found in the sheet.");
            return;
          }

          const lines = last
            .map((r, idx) => {
              const date = r.Date || r.date || "n/a";
              const p1 = r.P1 || r.p1 || "?";
              const p2 = r.P2 || r.p2 || "?";
              const d1 = r.P1_deck || r.p1_deck || "?";
              const d2 = r.P2_deck || r.p2_deck || "?";
              const winner = r.Winner || r.winner || "?";
              const result = r.Result || r.result || "";
              return `${last.length - idx}. **${date}** – ${p1} (${d1}) vs ${p2} (${d2}) → **${winner}** ${result}`;
            })
            .reverse()
            .join("\n");

          await interaction.editReply(lines);
          return;
        }

        case "meta": {
          const decks = new Map();
          for (const r of rows) {
            const p1 = (r.P1 || r.p1 || "").trim();
            const p2 = (r.P2 || r.p2 || "").trim();
            const w = (r.Winner || r.winner || "").trim();
            const d1raw = r.P1_deck || r.p1_deck;
            const d2raw = r.P2_deck || r.p2_deck;
            const d1 = norm(d1raw);
            const d2 = norm(d2raw);

            if (!d1 || !d2) continue;

            const d1Stat = ensureDeck(decks, d1, d1raw);
            const d2Stat = ensureDeck(decks, d2, d2raw);

            d1Stat.matches++;
            d2Stat.matches++;

            if (!w || (!p1 && !p2)) continue;

            let winnerDeck = null;
            let loserDeck = null;

            if (w === p1) {
              winnerDeck = d1Stat;
              loserDeck = d2Stat;
            } else if (w === p2) {
              winnerDeck = d2Stat;
              loserDeck = d1Stat;
            }

            if (winnerDeck && loserDeck) {
              winnerDeck.wins++;
              loserDeck.losses++;
            }
          }

          const all = [...decks.values()];
          if (!all.length) {
            await interaction.editReply("⚠️ No deck data found in the sheet.");
            return;
          }

          all.sort((a, b) => b.matches - a.matches);

          const top = all.slice(0, 10);
          const lines = top
            .map((d, i) => {
              const wr = d.matches ? ((d.wins / d.matches) * 100).toFixed(1) : "0.0";
              return `${i + 1}. **${d.name}** – ${d.matches} matches, record ${d.wins}-${d.losses} (${wr}% wins)`;
            })
            .join("\n");

          const embed = new EmbedBuilder()
            .setTitle("📊 Current Meta Overview")
            .setDescription(lines)
            .setTimestamp(new Date());

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        case "deckstats": {
          const deckInput = interaction.options.getString("deck");
          const key = norm(deckInput);

          let matches = 0,
            wins = 0,
            losses = 0;

          for (const r of rows) {
            const p1 = (r.P1 || r.p1 || "").trim();
            const p2 = (r.P2 || r.p2 || "").trim();
            const w = (r.Winner || r.winner || "").trim();
            const d1 = norm(r.P1_deck || r.p1_deck);
            const d2 = norm(r.P2_deck || r.p2_deck);

            let deckSide = null;
            if (d1 === key) deckSide = "p1";
            else if (d2 === key) deckSide = "p2";
            else continue;

            matches++;
            if (!w) continue;

            if ((deckSide === "p1" && w === p1) || (deckSide === "p2" && w === p2)) wins++;
            else losses++;
          }

          if (!matches) {
            await interaction.editReply(
              `⚠️ No matches found for deck **${deckInput}**. Check spelling / naming.`
            );
            return;
          }

          const wr = ((wins / matches) * 100).toFixed(1);
          await interaction.editReply(
            `📈 Stats for **${deckInput}**:\nMatches: **${matches}**\nRecord: **${wins}-${losses}** (${wr}% wins)`
          );
          return;
        }

        case "matchups": {
          const deckInput = interaction.options.getString("deck");
          const key = norm(deckInput);
          const matchups = new Map();

          for (const r of rows) {
            const p1 = (r.P1 || r.p1 || "").trim();
            const p2 = (r.P2 || r.p2 || "").trim();
            const w = (r.Winner || r.winner || "").trim();
            const d1raw = r.P1_deck || r.p1_deck;
            const d2raw = r.P2_deck || r.p2_deck;
            const d1 = norm(d1raw);
            const d2 = norm(d2raw);

            let side = null;
            let oppKey = null;
            let oppLabel = null;

            if (d1 === key && d2) {
              side = "p1";
              oppKey = d2;
              oppLabel = d2raw;
            } else if (d2 === key && d1) {
              side = "p2";
              oppKey = d1;
              oppLabel = d1raw;
            } else continue;

            if (!matchups.has(oppKey)) {
              matchups.set(oppKey, {
                name: oppLabel || oppKey,
                matches: 0,
                wins: 0,
                losses: 0,
              });
            }

            const m = matchups.get(oppKey);
            m.matches++;

            if (!w) continue;

            const deckWon =
              (side === "p1" && w === p1) || (side === "p2" && w === p2);
            if (deckWon) m.wins++;
            else m.losses++;
          }

          const all = [...matchups.values()];
          if (!all.length) {
            await interaction.editReply(
              `⚠️ No matchup data found for deck **${deckInput}**.`
            );
            return;
          }

          all.sort((a, b) => b.matches - a.matches);
          const top = all.slice(0, 10);
          const lines = top
            .map((m) => {
              const wr = m.matches ? ((m.wins / m.matches) * 100).toFixed(1) : "0.0";
              return `• vs **${m.name}** – ${m.matches} matches, ${m.wins}-${m.losses} (${wr}% wins)`;
            })
            .join("\n");

          await interaction.editReply(
            `📊 Matchups for **${deckInput}**:\n${lines}`
          );
          return;
        }

        case "topdeck": {
          const deckInput = interaction.options.getString("deck");
          const key = norm(deckInput);
          const pilots = new Map();

          for (const r of rows) {
            const p1 = (r.P1 || r.p1 || "").trim();
            const p2 = (r.P2 || r.p2 || "").trim();
            const w = (r.Winner || r.winner || "").trim();
            const d1 = norm(r.P1_deck || r.p1_deck);
            const d2 = norm(r.P2_deck || r.p2_deck);

            if (d1 === key && p1) {
              if (!pilots.has(p1)) pilots.set(p1, { matches: 0, wins: 0, losses: 0 });
              const s = pilots.get(p1);
              s.matches++;
              if (w === p1) s.wins++;
              else if (w === p2) s.losses++;
            }

            if (d2 === key && p2) {
              if (!pilots.has(p2)) pilots.set(p2, { matches: 0, wins: 0, losses: 0 });
              const s = pilots.get(p2);
              s.matches++;
              if (w === p2) s.wins++;
              else if (w === p1) s.losses++;
            }
          }

          const all = [...pilots.entries()]
            .filter(([_, s]) => s.matches > 0);

          if (!all.length) {
            await interaction.editReply(
              `⚠️ No pilot data found for deck **${deckInput}**.`
            );
            return;
          }

          all.sort((a, b) => b[1].matches - a[1].matches);

          const top = all.slice(0, 10);
          const lines = top
            .map(([name, s], i) => {
              const wr = s.matches ? ((s.wins / s.matches) * 100).toFixed(1) : "0.0";
              return `${i + 1}. **${name}** – ${s.matches} matches, ${s.wins}-${s.losses} (${wr}% wins)`;
            })
            .join("\n");

          await interaction.editReply(
            `👑 Top pilots for **${deckInput}**:\n${lines}`
          );
          return;
        }

        case "vs": {
          const d1Input = interaction.options.getString("deck1");
          const d2Input = interaction.options.getString("deck2");
          const k1 = norm(d1Input);
          const k2 = norm(d2Input);

          let d1Wins = 0,
            d2Wins = 0,
            matches = 0;

          for (const r of rows) {
            const p1 = (r.P1 || r.p1 || "").trim();
            const p2 = (r.P2 || r.p2 || "").trim();
            const w = (r.Winner || r.winner || "").trim();
            const d1 = norm(r.P1_deck || r.p1_deck);
            const d2 = norm(r.P2_deck || r.p2_deck);

            const set1 = new Set([d1, d2]);
            if (!set1.has(k1) || !set1.has(k2)) continue;

            matches++;
            if (!w) continue;

            // figure which deck won
            if (w === p1) {
              if (d1 === k1) d1Wins++;
              else if (d1 === k2) d2Wins++;
            } else if (w === p2) {
              if (d2 === k1) d1Wins++;
              else if (d2 === k2) d2Wins++;
            }
          }

          if (!matches) {
            await interaction.editReply(
              `⚠️ No matches found between **${d1Input}** and **${d2Input}**.`
            );
            return;
          }

          await interaction.editReply(
            `⚔️ Head-to-head **${d1Input}** vs **${d2Input}**:\n` +
              `Matches: **${matches}**\n` +
              `${d1Input}: **${d1Wins}** wins\n` +
              `${d2Input}: **${d2Wins}** wins`
          );
          return;
        }

        case "trend": {
          const deckInput = interaction.options.getString("deck");
          const key = norm(deckInput);

          const series = [];
          for (const r of rows) {
            const date = r.Date || r.date || "n/a";
            const p1 = (r.P1 || r.p1 || "").trim();
            const p2 = (r.P2 || r.p2 || "").trim();
            const w = (r.Winner || r.winner || "").trim();
            const d1 = norm(r.P1_deck || r.p1_deck);
            const d2 = norm(r.P2_deck || r.p2_deck);

            let side = null;
            if (d1 === key) side = "p1";
            else if (d2 === key) side = "p2";
            else continue;

            let result = "L";
            if (!w) result = "-";
            else if ((side === "p1" && w === p1) || (side === "p2" && w === p2)) result = "W";

            series.push({ date, result });
          }

          if (!series.length) {
            await interaction.editReply(
              `⚠️ No matches found for deck **${deckInput}**.`
            );
            return;
          }

          const last = series.slice(-12); // last 12 matches
          const summary = last
            .map((m) => `${m.date}: ${m.result}`)
            .join("\n");

          await interaction.editReply(
            `📈 Recent results for **${deckInput}** (latest last):\n${summary}`
          );
          return;
        }

        default:
          await interaction.editReply("⚠️ Command not implemented yet.");
          return;
      }
    } catch (err) {
      console.error("Slash command error:", cmd, err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("❌ Error while processing that command.");
      } else {
        await interaction.reply({
          content: "❌ Error while processing that command.",
          ephemeral: true,
        });
      }
    }
  });
};
