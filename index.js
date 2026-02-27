const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

// ================= WEB SERVER =================
const app = express();

app.get("/", (req, res) => {
  res.send("Bot online ✅");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🌐 Web server ativo na porta", PORT);
});

// ================= DISCORD BOT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// evita crash silencioso
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.once("ready", () => {
  console.log("🤖 BOT ONLINE:", client.user.tag);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.log("❌ DISCORD_TOKEN NÃO DEFINIDO NO RENDER");
} else {
  console.log("✅ TOKEN ENCONTRADO, tentando login...");
  client.login(token)
    .then(() => console.log("✅ LOGIN OK"))
    .catch(err => console.error("❌ ERRO LOGIN:", err));
}