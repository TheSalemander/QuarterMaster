// ==============================
// QuarterMaster Bot (Deck Matrix Handler Only)
// ==============================

const { Events } = require("discord.js");
const { createCanvas, registerFont } = require("canvas");
const fs = require("fs");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
 // Only if not globally available

const SHEETDB_URL_DECK_MATRIX = process.env.SHEETDB_URL_DECK_MATRIX;

// Font registration
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

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "deck-matrix") return;

    let replied = false;
    try {
      await interaction.deferReply();
      replied = true;
    } catch (err) {
      console.warn("⚠️ Could not defer reply:", err.message);
    }

    try {
      const response = await fetch(SHEETDB_URL_DECK_MATRIX);
      const raw = await response.json();
      const matrixRaw = Array.isArray(raw) ? raw : raw.data;

      if (!Array.isArray(matrixRaw)) {
        const msg = "⚠️ Deck Matrix format invalid.";
        if (replied) await interaction.editReply(msg);
        return;
      }

      const matrix = matrixRaw.map((row) => {
        const cleaned = {};
        for (const [key, value] of Object.entries(row)) {
          if (key && key.trim()) cleaned[key.trim()] = (value || "").trim();
        }
        return cleaned;
      }).filter((r) => r.DECK && r.DECK.trim() && r.DECK !== "-" && !r.DECK.includes("#NAME?"));

      if (!matrix.length) {
        const msg = "⚠️ No Deck Matrix data found.";
        if (replied) await interaction.editReply(msg);
        return;
      }

      const headers = Object.keys(matrix[0]).filter((h) => h && h.trim());
      const rows = matrix.map((r) => headers.map((h) => r[h] || "-"));
      const cellW = 140, cellH = 45;
      const width = cellW * (headers.length + 1);
      const height = cellH * (rows.length + 1);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const getHeatColor = (pct) => {
        const match = pct.match(/\((\d+)%\)/);
        const value = match ? parseInt(match[1]) : null;
        if (value == null) return "#f8f8f8";
        const g = Math.round(255 * (value / 100));
        const r = Math.round(255 * (1 - value / 100));
        return `rgb(${r},${g},120)`;
      };

      const fitText = (text, maxWidth, baseSize = 16) => {
        let size = baseSize;
        ctx.font = `bold ${size}px NotoSans`;
        while (ctx.measureText(text).width > maxWidth - 10 && size > 10) {
          size--;
          ctx.font = `bold ${size}px NotoSans`;
        }
      };

      headers.forEach((h, i) => {
        ctx.fillStyle = "#ff4d4d";
        ctx.fillRect((i + 1) * cellW, 0, cellW, cellH);
        ctx.fillStyle = "#fff";
        fitText(h, cellW - 10, 18);
        ctx.fillText(h, (i + 1.5) * cellW, cellH / 2);
      });

      headers.forEach((h, i) => {
        ctx.fillStyle = "#00cc44";
        ctx.fillRect(0, (i + 1) * cellH, cellW, cellH);
        ctx.fillStyle = "#fff";
        fitText(h, cellW - 10, 18);
        ctx.fillText(h, cellW / 2, (i + 1.5) * cellH);
      });

      rows.forEach((row, y) => {
        row.forEach((cell, x) => {
          ctx.fillStyle = x === y ? "#ccc" : getHeatColor(cell);
          ctx.fillRect((x + 1) * cellW, (y + 1) * cellH, cellW, cellH);
          ctx.strokeStyle = "#00000020";
          ctx.strokeRect((x + 1) * cellW, (y + 1) * cellH, cellW, cellH);
          ctx.fillStyle = "#000";
          fitText(cell, cellW - 12, 14);
          ctx.fillText(cell, (x + 1.5) * cellW, (y + 1.5) * cellH);
        });
      });

      const filePath = "./deck_matrix.png";
      fs.writeFileSync(filePath, canvas.toBuffer("image/png"));

      const msg = {
        content: "📊 **Current Deck Matchup Matrix (Heatmap View)**",
        files: [filePath],
      };

      if (replied)
        await interaction.editReply(msg);
      else
        await interaction.reply(msg);

    } catch (err) {
      console.error("❌ Deck Matrix error:", err);
      const fallback = "❌ Error creating deck matrix.";
      if (replied)
        await interaction.editReply(fallback).catch(() => {});
      else
        await interaction.reply(fallback).catch(() => {});
    }
  });
};
