const express = require("express");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

// ===== SERVIDOR WEB (Render precisa) =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot online"));

app.listen(PORT, () => {
    console.log("Porta aberta:", PORT);
});

// ===== DISCORD =====
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_TOKEN;

client.once("ready", async () => {
    console.log("Bot conectado como " + client.user.tag);

    // cria comando /help
    const commands = [
        new SlashCommandBuilder()
            .setName("help")
            .setDescription("Mostra ajuda")
            .toJSON()
    ];

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log("Slash command registrado");
    } catch (err) {
        console.error("Erro ao registrar comando:", err);
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "help") {
        await interaction.reply("✅ Bot funcionando! Comando /help ativo.");
    }
});

client.login(TOKEN);
