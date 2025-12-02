const { 
    Client, 
    GatewayIntentBits, 
    Events, 
    EmbedBuilder, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits,
    AuditLogEvent 
} = require('discord.js');

// --- CONFIGURAÇÃO PARA RENDER/REPLIT (Mantém o bot vivo) ---
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send({ 
    status: '🛡️ Guardian Online', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
}));

app.listen(port, () => console.log(`🌐 Web Server rodando na porta ${port}`));
// -----------------------------------------------------------

console.log('🔄 INICIANDO SISTEMA DE SEGURANÇA...');

// ⚙️ CONFIGURAÇÃO CENTRAL (EDITAR AQUI)
const CONFIG = {
    // Se estiver no Replit/Render, use process.env.DISCORD_TOKEN. Se for PC local, coloque o token entre aspas.
    TOKEN: process.env.DISCORD_TOKEN || 'SEU_TOKEN_AQUI', 
    
    // Canal onde avisa que alguém ENTROU
    JOIN_LOG_CHANNEL: '1445105097796223078', 
    
    // Canal onde avisa que alguém SAIU (Pode ser o mesmo do de cima se quiser)
    LEAVE_LOG_CHANNEL: '1445105144869032129', 

    MIN_AGE_DAYS: 7, // Dias mínimos para conta não ser suspeita
    AUTO_KICK: false // Se true, expulsa contas novas automaticamente
};

// --- PREVENÇÃO DE CRASH ---
process.on('uncaughtException', (error) => {
    console.error('❌ ERRO FATAL:', error);
});
process.on('unhandledRejection', (reason) => {
    console.error('❌ ERRO EM PROMESSA:', reason);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // OBRIGATÓRIO ATIVAR NO DEV PORTAL
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration // Necessário para ler Audit Logs
    ],
    partials: [Partials.GuildMember, Partials.User]
});

client.once(Events.ClientReady, c => {
    console.log(`✅ SISTEMA OPERACIONAL: ${c.user.tag}`);
    client.user.setActivity('🛡️ Monitorando Perímetro');
});

// --- FUNÇÃO AUXILIAR ---
const createProgressBar = (days, minDays) => {
    const percentage = Math.min(days / minDays, 1);
    const bars = 10;
    const filled = Math.floor(percentage * bars);
    const empty = bars - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
};

// 🚨 EVENTO: ENTRADA DE MEMBRO
client.on(Events.GuildMemberAdd, async member => {
    try {
        const createdAt = member.user.createdAt;
        const now = new Date();
        const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

        const isSuspicious = diffDays < CONFIG.MIN_AGE_DAYS;
        const color = isSuspicious ? 0xED4245 : 0x57F287; 
        const title = isSuspicious ? '⛔ ALERTA DE SEGURANÇA: CONTA DE RISCO' : '✅ ACESSO PERMITIDO: CONTA SEGURA';

        const aiMessage = `🛡️ PROTOCOLO DE SEGURANÇA: Análise de novo usuário iniciada.`;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ 
                name: `${member.user.tag} entrou no servidor`, 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            })
            .setTitle(title)
            .setDescription(`> ${aiMessage}\n\n**📋 Análise Técnica:**`)
            .addFields(
                { name: '🆔 Identificação (ID)', value: `\`\`\`yaml\n${member.id}\n\`\`\``, inline: true },
                { name: '🤖 Tipo', value: `\`\`\`fix\n${member.user.bot ? 'BOT' : 'HUMANO'}\n\`\`\``, inline: true },
                { name: '⏳ Idade da Conta', value: `**${diffDays} dias**\n${createProgressBar(diffDays, 30)}`, inline: false },
                { name: '📅 Data de Criação', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:F> (<t:${Math.floor(createdAt.getTime() / 1000)}:R>)`, inline: false }
            )
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: `Security System v2.0 • ${new Date().toLocaleTimeString()}`, iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId(`kick_${member.id}`).setLabel('EXPULSAR').setEmoji('🥾').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_${member.id}`).setLabel('BANIR AGENTE').setEmoji('🔨').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`info_${member.id}`).setLabel('RELATÓRIO').setEmoji('📄').setStyle(ButtonStyle.Secondary)
            );

        const channel = member.guild.channels.cache.get(CONFIG.JOIN_LOG_CHANNEL);

        if (channel && channel.isTextBased()) {
            await channel.send({ 
                content: isSuspicious ? `||@here|| 🚨 **ATENÇÃO STAFF:** Possível Raid/Alt detectada!` : null,
                embeds: [embed], 
                components: [row] 
            });
        }

        if (CONFIG.AUTO_KICK && isSuspicious) {
            await member.kick('🛡️ Auto-Defense: Conta muito recente.');
            if(channel) await channel.send(`🤖 **AUTO-DEFESA:** O alvo ${member.user.tag} foi neutralizado (Kick) automaticamente.`);
        }

    } catch (error) {
        console.error('Erro no guildMemberAdd:', error);
    }
});

// 🏃 SAÍDA DO MEMBRO — CORRIGIDO
client.on(Events.GuildMemberRemove, async member => {
    const logChannel = member.guild.channels.cache.get(CONFIG.LEAVE_LOG_CHANNEL);
    if (!logChannel || !logChannel.isTextBased()) return;

    let action = 'Saiu por conta própria';
    let executor = null;
    let color = 0xFEE75C; // Amarelo padrão para saída

    try {
        // Busca logs de Kick
        const kickLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberKick,
        });
        const kickLog = kickLogs.entries.first();

        // Busca logs de Ban
        const banLogs = await member.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MemberBanAdd,
        });
        const banLog = banLogs.entries.first();

        // Verifica se foi Ban
        if (banLog && banLog.target.id === member.id && banLog.createdTimestamp > (Date.now() - 5000)) {
            action = '🔴 BANIDO';
            executor = banLog.executor;
            color = 0x000000;
        } 
        // Verifica se foi Kick (se não foi ban)
        else if (kickLog && kickLog.target.id === member.id && kickLog.createdTimestamp > (Date.now() - 5000)) {
            action = '🟠 EXPULSO (Kick)';
            executor = kickLog.executor;
            color = 0xED4245;
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({
                name: `${member.user.tag} saiu do servidor`,
                iconURL: member.user.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`
👤 **Usuário:** ${member.user} (\`${member.id}\`)
📝 **Ação Detectada:** ${action}
${executor ? `👮 **Executor:** ${executor} (\`${executor.tag}\`)` : ''}
            `)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `ID: ${member.id} • Membros restantes: ${member.guild.memberCount}` })
            .setTimestamp();

        logChannel.send({ embeds: [embed] });

    } catch (e) {
        console.error('Erro ao processar saída:', e);
        // Envia log simples se falhar na auditoria
        logChannel.send(`📤 **${member.user.tag}** saiu do servidor (Erro ao verificar auditoria).`);
    }
});

// 🎮 CONTROLE DE INTERAÇÕES (Botões)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: '⛔ **Você não tem permissão para usar isso.**', ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split('_');
    const guild = interaction.guild;

    let targetUser;
    try {
        targetUser = await client.users.fetch(targetId);
    } catch {
        return interaction.reply({ content: '❌ Usuário não encontrado (ID inválido).', ephemeral: true });
    }

    const targetMember = guild.members.cache.get(targetId);

    try {
        if (action === 'kick') {
            if (!targetMember) return interaction.reply({ content: '❌ O usuário já saiu do servidor.', ephemeral: true });
            await targetMember.kick(`Operação manual via Bot por ${interaction.user.tag}`);
            await interaction.reply({ content: `👢 **Sucesso:** ${targetUser.tag} foi expulso.` });
        }

        if (action === 'ban') {
            await guild.members.ban(targetId, { reason: `Ban manual via Bot por ${interaction.user.tag}` });
            await interaction.reply({ content: `🔨 **Sucesso:** ${targetUser.tag} foi banido.` });
        }

        if (action === 'info') {
            const created = targetUser.createdAt;
            const joined = targetMember ? targetMember.joinedAt : null;

            const infoEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`📁 Dossiê: ${targetUser.tag}`)
                .setDescription(`
**ID:** \`${targetUser.id}\`
**Bot:** ${targetUser.bot ? 'Sim' : 'Não'}
**Criado em:** <t:${Math.floor(created.getTime()/1000)}:F>
**Entrou em:** ${joined ? `<t:${Math.floor(joined.getTime()/1000)}:F>` : 'Não está no servidor'}
                `);

            await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
        }

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: `❌ **Erro:** Verifique se o bot tem permissão (o cargo dele deve estar acima do alvo).`, ephemeral: true });
    }
});

client.login(CONFIG.TOKEN).catch(err => {
    console.error('❌ FALHA NO LOGIN: Verifique o Token no arquivo ou nas variáveis de ambiente.');
});