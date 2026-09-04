const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, PermissionsBitField } = require('discord.js');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const ROLE_ID = process.env.ROLE_ID;
const BACKUP_SERVER_ID = process.env.BACKUP_SERVER_ID;
const TOKENS_FILE = path.join(__dirname, 'tokens.json');
const PENDING_FILE = path.join(__dirname, 'pending.json');
// ----------------------------------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ]
});

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

// ----------------------------------------------------------------
// pendingAuthの読み書き
// ----------------------------------------------------------------

function loadPending() {
    if (!fs.existsSync(PENDING_FILE)) return new Map();
    try {
        const data = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
        return new Map(Object.entries(data));
    } catch {
        return new Map();
    }
}

function savePending(map) {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(PENDING_FILE, JSON.stringify(obj, null, 2));
}

const pendingAuth = loadPending();

// ----------------------------------------------------------------
// トークンの読み書き
// ----------------------------------------------------------------

function loadTokens() {
    if (!fs.existsSync(TOKENS_FILE)) return new Map();
    try {
        const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
        return new Map(Object.entries(data));
    } catch {
        return new Map();
    }
}

function saveTokens(map) {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(obj, null, 2));
}

const userTokens = loadTokens();
console.log('トークン読み込み: ' + userTokens.size + '人分');

// ----------------------------------------------------------------
// HTMLテンプレート
// ----------------------------------------------------------------

const HTML_BASE = (icon, title, msg, color, sub) => '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + title + '</title><style>@import url(\'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap\');*{margin:0;padding:0;box-sizing:border-box;}body{background:#0a0a1a;color:#fff;font-family:\'Noto Sans JP\',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;overflow:hidden;}.bg{position:fixed;inset:0;background:radial-gradient(ellipse at 20% 50%,#1a0533 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,#001a3a 0%,transparent 60%),radial-gradient(ellipse at 60% 80%,#0d1f0d 0%,transparent 60%);z-index:0;}.stars{position:fixed;inset:0;z-index:0;}.star{position:absolute;border-radius:50%;background:#fff;animation:twinkle var(--d) ease-in-out infinite;opacity:0;}@keyframes twinkle{0%,100%{opacity:0;transform:scale(0.8);}50%{opacity:var(--o);transform:scale(1.2);}}.card{position:relative;z-index:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:56px 48px;text-align:center;max-width:460px;width:90%;backdrop-filter:blur(20px);box-shadow:0 0 60px rgba(' + color + ',0.15),0 20px 60px rgba(0,0,0,0.5);animation:fadeIn 0.6s ease;}@keyframes fadeIn{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:translateY(0);}}.icon-wrap{width:96px;height:96px;margin:0 auto 24px;border-radius:50%;background:rgba(' + color + ',0.15);border:2px solid rgba(' + color + ',0.4);display:flex;align-items:center;justify-content:center;font-size:48px;animation:pulse 2s ease-in-out infinite;}@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(' + color + ',0.3);}50%{box-shadow:0 0 0 16px rgba(' + color + ',0);}}h1{font-size:26px;font-weight:700;margin-bottom:12px;background:linear-gradient(135deg,#fff,rgba(' + color + ',1));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}.msg{color:rgba(255,255,255,0.6);font-size:15px;line-height:1.8;}.sub{margin-top:16px;padding:12px 16px;background:rgba(255,255,255,0.05);border-radius:12px;font-size:13px;color:rgba(255,255,255,0.4);border-left:3px solid rgba(' + color + ',0.6);text-align:left;}.badge{display:inline-block;margin-top:20px;padding:6px 16px;border-radius:999px;background:rgba(' + color + ',0.15);border:1px solid rgba(' + color + ',0.4);font-size:12px;color:rgba(255,255,255,0.7);}</style></head><body><div class="bg"></div><div class="stars" id="stars"></div><div class="card"><div class="icon-wrap">' + icon + '</div><h1>' + title + '</h1><p class="msg">' + msg + '</p>' + (sub ? '<div class="sub">原因: ' + sub + '</div>' : '') + '<div class="badge">Powered by お手伝いbot</div></div><script>var s=document.getElementById("stars");for(var i=0;i<80;i++){var el=document.createElement("div");el.className="star";var size=Math.random()*2.5+0.5;el.style.width=size+"px";el.style.height=size+"px";el.style.top=(Math.random()*100)+"%";el.style.left=(Math.random()*100)+"%";el.style.setProperty("--d",(2+Math.random()*4)+"s");el.style.setProperty("--o",(0.3+Math.random()*0.7));el.style.animationDelay=(Math.random()*4)+"s";s.appendChild(el);}<\/script></body></html>';

// ----------------------------------------------------------------
// Expressルート
// ----------------------------------------------------------------

app.get('/', (req, res) => {
    res.send(HTML_BASE('🔐', '認証ページ', 'Discordの認証ボタンを押して<br>アカウント認証を行ってください。', '88,101,242', ''));
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state || !pendingAuth.has(state)) {
        return res.send(HTML_BASE('⚠️', 'アクセス拒否', 'このページへの直接アクセスは<br>許可されていません。', '255,100,100', 'Discordの認証ボタン経由でアクセスしてください'));
    }

    const { userId, guildId } = pendingAuth.get(state);
    pendingAuth.delete(state);
    savePending(pendingAuth);

    try {
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const accessToken = tokenRes.data.access_token;

        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: 'Bearer ' + accessToken }
        });

        const discordId = userRes.data.id;

        userTokens.set(discordId, accessToken);
        saveTokens(userTokens);

        try {
            await axios.put(
                'https://discord.com/api/guilds/' + guildId + '/members/' + discordId,
                { access_token: accessToken },
                { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
            );
        } catch (e) {
            console.error('メンバー追加エラー:', e.response?.data || e.message);
        }

        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (member) {
                await member.roles.add(ROLE_ID);
                return res.send(HTML_BASE('✅', '認証完了！', 'ロールが付与されました。<br>Discordに戻ってください。', '87,242,135', ''));
            }
        }

        res.send(HTML_BASE('❌', 'エラー', '認証に失敗しました。', '255,100,100', 'メンバー情報が取得できませんでした'));
    } catch (err) {
        console.error('OAuth2エラー:', err.response?.data || err.message);
        res.send(HTML_BASE('❌', '認証失敗', 'OAuth2認証中にエラーが発生しました。', '255,100,100', err.response?.data?.error_description || err.message));
    }
});

app.listen(PORT, () => console.log('Expressサーバー起動: ポート' + PORT));

// ----------------------------------------------------------------
// スラッシュコマンド登録
// ----------------------------------------------------------------

const commands = [
    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('認証パネルを設置します'),
    new SlashCommandBuilder()
        .setName('backup')
        .setDescription('認証済みの全員をバックアップサーバーに追加します'),
    new SlashCommandBuilder()
        .setName('members')
        .setDescription('認証済みのユーザー数を確認します'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Botの稼働状態を確認します'),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('特定ユーザーのトークンを削除します')
        .addUserOption(opt => opt.setName('user').setDescription('対象ユーザー').setRequired(true)),
    new SlashCommandBuilder()
        .setName('roleremove')
        .setDescription('選択したロールを全メンバーから一括削除します')
        .addRoleOption(opt => opt.setName('role').setDescription('削除するロール').setRequired(true)),
    new SlashCommandBuilder()
        .setName('add')
        .setDescription('特定ユーザーのみバックアップサーバーに追加します')
        .addUserOption(opt => opt.setName('user').setDescription('対象ユーザー').setRequired(true)),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('スラッシュコマンド登録完了');
    } catch (err) {
        console.error('コマンド登録エラー:', err);
    }
})();

// ----------------------------------------------------------------
// Bot イベント
// ----------------------------------------------------------------

client.once('ready', () => {
    console.log('Botログイン: ' + client.user.tag);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // ----------------------------------------------------------------
    if (commandName === 'panel') {
        const embed = new EmbedBuilder()
            .setTitle('🔐 認証パネル')
            .setDescription('下のボタンを押してDiscordアカウントで認証してください。\n認証完了後、ロールが付与されます。')
            .setColor(0x5865F2)
            .setFooter({ text: 'Powered by お手伝いbot' });

        const state = interaction.user.id + '_' + Date.now();
        pendingAuth.set(state, { userId: interaction.user.id, guildId: interaction.guildId });
        savePending(pendingAuth);

        const authUrl = 'https://discord.com/oauth2/authorize?client_id=' + CLIENT_ID + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) + '&response_type=code&scope=identify%20guilds.join&state=' + state;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('✅ 認証する')
                .setStyle(ButtonStyle.Link)
                .setURL(authUrl)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // ----------------------------------------------------------------
    if (commandName === 'backup') {
        await interaction.deferReply();
        const backupGuild = client.guilds.cache.get(BACKUP_SERVER_ID);
        if (!backupGuild) {
            return interaction.editReply('❌ バックアップサーバーが見つかりません。');
        }

        let added = 0, failed = 0;
        for (const [userId, accessToken] of userTokens.entries()) {
            try {
                await axios.put(
                    'https://discord.com/api/guilds/' + BACKUP_SERVER_ID + '/members/' + userId,
                    { access_token: accessToken },
                    { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
                );
                added++;
            } catch {
                failed++;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('📦 バックアップ完了')
            .addFields(
                { name: '✅ 追加成功', value: added + '人', inline: true },
                { name: '❌ 失敗', value: failed + '人', inline: true },
                { name: '合計', value: userTokens.size + '人', inline: true }
            )
            .setColor(0x57F287)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    // ----------------------------------------------------------------
    if (commandName === 'members') {
        const embed = new EmbedBuilder()
            .setTitle('👥 認証済みメンバー')
            .setDescription('現在 **' + userTokens.size + '人** が認証済みです。')
            .setColor(0x5865F2)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ----------------------------------------------------------------
    if (commandName === 'status') {
        const uptime = Date.now() - startTime;
        const h = Math.floor(uptime / 3600000);
        const m = Math.floor((uptime % 3600000) / 60000);
        const s = Math.floor((uptime % 60000) / 1000);

        const embed = new EmbedBuilder()
            .setTitle('📊 Bot ステータス')
            .addFields(
                { name: '🟢 稼働時間', value: h + '時間 ' + m + '分 ' + s + '秒', inline: false },
                { name: '👥 認証済み', value: userTokens.size + '人', inline: true },
                { name: '🏠 サーバー数', value: client.guilds.cache.size + 'サーバー', inline: true },
            )
            .setColor(0x57F287)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ----------------------------------------------------------------
    if (commandName === 'kick') {
        const target = interaction.options.getUser('user');
        if (userTokens.has(target.id)) {
            userTokens.delete(target.id);
            saveTokens(userTokens);
            await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🗑️ <@' + target.id + '> のトークンを削除しました。').setColor(0xED4245)] });
        } else {
            await interaction.reply({ content: '⚠️ そのユーザーは認証済みリストにいません。', ephemeral: true });
        }
    }

    // ----------------------------------------------------------------
    if (commandName === 'roleremove') {
        await interaction.deferReply();
        const role = interaction.options.getRole('role');
        const guild = interaction.guild;

        const members = await guild.members.fetch();
        const targets = Array.from(members.filter(m => m.roles.cache.has(role.id) && !m.user.bot).values());
        const total = targets.length;

        let removed = 0, failed = 0;

        for (let i = 0; i < targets.length; i++) {
            try {
                await targets[i].roles.remove(role.id);
                removed++;
            } catch {
                failed++;
            }

            // 10人ごとに進捗更新
            if ((i + 1) % 10 === 0 || i === targets.length - 1) {
                const percent = Math.floor(((i + 1) / total) * 100);
                const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
                await interaction.editReply({ embeds: [
                    new EmbedBuilder()
                        .setTitle('🗑️ ロール一括削除中...')
                        .addFields(
                            { name: '対象ロール', value: '<@&' + role.id + '>', inline: false },
                            { name: '進捗', value: bar + ' ' + percent + '%', inline: false },
                            { name: '✅ 削除済み', value: removed + '人', inline: true },
                            { name: '❌ 失敗', value: failed + '人', inline: true },
                            { name: '残り', value: (total - i - 1) + '人', inline: true },
                        )
                        .setColor(0xFEE75C)
                ] });
            }
        }

        await interaction.editReply({ embeds: [
            new EmbedBuilder()
                .setTitle('🗑️ ロール一括削除完了')
                .addFields(
                    { name: '対象ロール', value: '<@&' + role.id + '>', inline: false },
                    { name: '✅ 削除成功', value: removed + '人', inline: true },
                    { name: '❌ 失敗', value: failed + '人', inline: true },
                )
                .setColor(0xED4245)
                .setTimestamp()
        ] });
    }

    // ----------------------------------------------------------------
    if (commandName === 'add') {
        await interaction.deferReply();
        const target = interaction.options.getUser('user');
        const accessToken = userTokens.get(target.id);

        if (!accessToken) {
            return interaction.editReply('⚠️ そのユーザーは認証済みリストにいません。');
        }

        try {
            await axios.put(
                'https://discord.com/api/guilds/' + BACKUP_SERVER_ID + '/members/' + target.id,
                { access_token: accessToken },
                { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
            );
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription('✅ <@' + target.id + '> をバックアップサーバーに追加しました。').setColor(0x57F287)] });
        } catch (e) {
            await interaction.editReply('❌ 追加に失敗しました: ' + (e.response?.data?.message || e.message));
        }
    }
});

// ----------------------------------------------------------------
// サーバー削除検知
// ----------------------------------------------------------------

client.on('guildDelete', async (guild) => {
    console.log('サーバー削除検知: ' + guild.name);
    try {
        const backupGuild = client.guilds.cache.get(BACKUP_SERVER_ID);
        if (!backupGuild) return;

        let added = 0;
        for (const [userId, accessToken] of userTokens.entries()) {
            try {
                await axios.put(
                    'https://discord.com/api/guilds/' + BACKUP_SERVER_ID + '/members/' + userId,
                    { access_token: accessToken },
                    { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' } }
                );
                added++;
            } catch (e) {
                console.error('ユーザー ' + userId + ' の追加失敗:', e.response?.data || e.message);
            }
        }

        const notifyChannel = backupGuild.channels.cache.find(c =>
            c.isTextBased() && c.permissionsFor(backupGuild.members.me)?.has(PermissionsBitField.Flags.SendMessages)
        );
        if (notifyChannel) {
            await notifyChannel.send('⚠️ サーバー「' + guild.name + '」が消滅しました。\n✅ 認証済みメンバー ' + added + '人 をバックアップサーバーに自動追加しました。');
        }
    } catch (err) {
        console.error('guildDeleteエラー:', err.message);
    }
});

client.login(BOT_TOKEN);
