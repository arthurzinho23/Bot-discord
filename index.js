const express = require("express");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

// ===== WEB SERVER (Render precisa disso) =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot online");
});

app.listen(PORT, () => {
    console.log("Web service rodando na porta " + PORT);
});

// ===== DISCORD BOT =====
const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
    console.log(`Logado como ${client.user.tag}`);

    // comando /help
    const commands = [
        new SlashCommandBuilder()
            .setName("help")
            .setDescription("Mostra os comandos do bot")
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
        console.log("Registrando comandos...");
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log("Comando /help pronto");
    } catch (err) {
        console.error(err);
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "help") {
        await interaction.reply({
            content: "📌 Comandos disponíveis:\n/help",
            ephemeral: true
        });
    }
});

client.login(TOKEN);
