const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");

const app = express();

// ⚡ PORTA OBRIGATÓRIA DO RENDER
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot online ✅");
});

app.listen(PORT, () => {
  console.log("🌐 Web server ativo na porta " + PORT);
});

// ===== DISCORD BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`✅ Logado como ${client.user.tag}`);
});

// exemplo comando
client.on("messageCreate", (message) => {
  if (message.content === "!ping") {
    message.reply("Pong 🏓");
  }
});

// TOKEN VEM DO RENDER
client.login(process.env.DISCORD_TOKEN);