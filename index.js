client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== ALLOWED_CHANNEL) return;

    const parts = message.content.trim().split(/\s+/);
    const cmd = (parts.shift() || "").toLowerCase();
    const args = parts;

    // ------------------------------------------------------
    // COMMAND: !standings
    // ------------------------------------------------------
    if (cmd === "!standings") {
        try {
            const response = await fetch(SHEETDB_URL);
            const data = await response.json();
            data.sort((a, b) => a.Rank - b.Rank);

            let reply = "🏆 **MTG League Standings** 🏆\n";
            data.forEach(row => {
                reply += `${row.Rank}. ${row["Player Name"]} — ${row.Points} pts — Match W%: ${row["Match Win%"]} — Game W%: ${row["Game Win%"]}\n`;
            });

            return message.channel.send(reply);
        } catch (error) {
            console.error(error);
            return message.channel.send("Error fetching standings.");
        }
    }
    // ------------------------------------------------------
    // END COMMAND: !standings
    // ------------------------------------------------------


    // ------------------------------------------------------
    // COMMAND: !stats <player name>
    // ------------------------------------------------------
    if (cmd === "!stats") {
        const playerName = args.join(" ").trim();
        if (!playerName) return message.channel.send("Example: `!stats Allu`");

        try {
            const response = await fetch(SHEETDB_URL);
            const data = await response.json();

            const p = data.find(r => r["Player Name"].trim().toLowerCase() === playerName.toLowerCase());
            if (!p) return message.channel.send(`No stats found for "${playerName}".`);

            return message.channel.send(
                `📊 **Stats for ${p["Player Name"]}**\n\n` +
                `Rank: ${p.Rank}\n` +
                `Points: ${p.Points}\n` +
                `Matches Played: ${p["Matches Played"]}\n` +
                `Matches Won: ${p["Matches Won"]}\n` +
                `Games Won: ${p["Games Won"]}\n` +
                `Match Win%: ${p["Match Win%"]}\n` +
                `Game Win%: ${p["Game Win%"]}`
            );
        } catch (error) {
            console.error(error);
            return message.channel.send("Error fetching stats.");
        }
    }
    // ------------------------------------------------------
    // END COMMAND: !stats
    // ------------------------------------------------------


    // ------------------------------------------------------
    // COMMAND: !remaining <player name>
    // Shows how many matches remain vs each opponent
    // ------------------------------------------------------
    if (cmd === "!remaining") {
        const playerName = args.join(" ").trim();
        if (!playerName) return message.channel.send("Example: `!remaining Allu`");

        try {
            // Get player list from standings
            const standingsRes = await fetch(SHEETDB_URL);
            const standings = await standingsRes.json();
            const players = standings.map(p => p["Player Name"].trim());

            // Validate player
            const target = players.find(p => p.toLowerCase() === playerName.toLowerCase());
            if (!target) return message.channel.send(`No player named "${playerName}".`);

            // Fetch matches played
            const matchesRes = await fetch(`${SHEETDB_URL}?sheet=matches_games`);
            const matches = await matchesRes.json();

            // Count matches played vs each opponent
            const counts = {};
            players.forEach(p => { if (p !== target) counts[p] = 0; });

            matches.forEach(m => {
                const p1 = m.P1?.trim();
                const p2 = m.P2?.trim();
                if (!p1 || !p2) return;

                if (p1 === target && counts[p2] !== undefined) counts[p2]++;
                if (p2 === target && counts[p1] !== undefined) counts[p1]++;
            });

            // Build response
            let reply = `🎯 **Remaining Matches for ${target}** (out of 5 vs each opponent)\n\n`;

            Object.entries(counts).forEach(([opp, played]) => {
                const remaining = 5 - played;
                reply += `• vs **${opp}** — ${remaining} remaining\n`;
            });

            return message.channel.send(reply);

        } catch (err) {
            console.error(err);
            return message.channel.send("Error calculating remaining matches.");
        }
    }
    // ------------------------------------------------------
    // END COMMAND: !remaining
    // ------------------------------------------------------
});
