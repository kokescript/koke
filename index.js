// ============================================================
// Discord ロールパネル & 認証 & ギブウェイボット
// ============================================================

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, 
  PermissionFlagsBits, ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ============================================================
// 設定
// ============================================================
// トークンはハードコードせず、ホスティングパネルの「環境変数」機能
// (Environment Variables / Variables など) に DISCORD_TOKEN という
// 名前で登録してください。ローカルで動かす場合は .env + dotenv を使います。
const CONFIG = {
  TOKEN: process.env.DISCORD_TOKEN,
  DEFAULT_COLOR: '#00FFFF',
  MAX_ROLES_PER_PANEL: 25,
};

if (!CONFIG.TOKEN) {
  console.error('❌ DISCORD_TOKEN が設定されていません。ホスティングパネルの環境変数設定を確認してください。');
  process.exit(1);
}

// ============================================================
// データ管理
// ============================================================
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const d = { panels: {}, counter: 0, giveaways: {} };
      fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
      return d;
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    if (!data.giveaways) data.giveaways = {};
    if (!data.panels) data.panels = {};
    if (!data.counter) data.counter = 0;
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  } catch (e) {
    console.error('❌ データファイル読み込みエラー:', e);
    return { panels: {}, counter: 0, giveaways: {} };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ データファイル保存エラー:', e);
  }
}

// ============================================================
// ユーティリティ関数
// ============================================================
function extractRoleIds(input) {
  const ids = new Set();
  const mentionRegex = /<@&(\d+)>/g;
  let m;
  while ((m = mentionRegex.exec(input)) !== null) ids.add(m[1]);
  
  const rest = input.replace(mentionRegex, ' ');
  rest.split(/[\s,]+/).forEach((token) => {
    if (/^\d{15,25}$/.test(token)) ids.add(token);
  });
  return Array.from(ids);
}

function parseDuration(input) {
  const match = input.toLowerCase().match(/^(\d+)([smhdw])$/);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  const multipliers = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
    'w': 7 * 24 * 60 * 60 * 1000,
  };
  
  return value * multipliers[unit];
}

// ============================================================
// ボット初期化
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// ============================================================
// ボット準備完了時
// ============================================================
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} としてログインしました！`);
  console.log('-----------------------------------');

  try {
    await client.application.commands.set([
      {
        name: 'rolepanel',
        description: '【管理者専用】プルダウン選択式のロールパネルを設置します',
        options: [
          { name: 'title', description: 'パネルのタイトル', type: 3, required: true },
          { name: 'description', description: 'パネルの説明文 (\\nで改行)', type: 3, required: true },
          {
            name: 'roles',
            description: '付与したいロールをメンションかIDで指定（最大25個）',
            type: 3,
            required: true,
          },
        ],
      },
      {
        name: 'verify',
        description: '【管理者専用】認証パネルを設置します',
        options: [
          { name: 'title', description: 'パネルのタイトル', type: 3, required: true },
          { name: 'description', description: 'パネルの説明文 (\\nで改行)', type: 3, required: true },
          {
            name: 'roles',
            description: '認証後に付与するロール（複数指定可）',
            type: 3,
            required: true,
          },
        ],
      },
      {
        name: 'giveaway',
        description: '【管理者専用】ギブウェイを開始します',
        options: [
          { name: 'prize', description: '景品名', type: 3, required: true },
          { name: 'description', description: '説明文 (\\nで改行)', type: 3, required: true },
          { name: 'winners', description: '当選人数（1〜10人）', type: 4, required: true },
          { 
            name: 'duration', 
            description: '期間（例: 30m, 1h, 1d, 1w）', 
            type: 3, 
            required: true 
          },
          {
            name: 'boost_roles',
            description: 'ブースト対象のロール（メンションかID、複数指定可）',
            type: 3,
            required: false,
          },
          {
            name: 'boost_multiplier',
            description: 'ブースト倍率（2倍、3倍など）',
            type: 4,
            required: false,
          },
        ],
      },
      {
        name: 'nuke',
        description: '【管理者専用】チャンネルを複製してリセットします',
        options: [],
      },
    ]);
    
    console.log('✅ コマンドを登録しました。');
    console.log('✅ ボットの準備が完了しました！');
  } catch (e) {
    console.error('❌ コマンド登録エラー:', e);
  }
});

// ============================================================
// 権限チェック関数
// ============================================================
function hasAdminPermission(member) {
  return (
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

// ============================================================
// インタラクション処理
// ============================================================
client.on('interactionCreate', async (interaction) => {
  try {
    // ============================================================
    // スラッシュコマンド処理
    // ============================================================
    if (interaction.isChatInputCommand()) {
      if (!hasAdminPermission(interaction.member)) {
        return interaction.reply({ 
          content: '❌ このコマンドを実行するには「ロールの管理」権限が必要です！', 
          ephemeral: true 
        });
      }

      // /rolepanel
      if (interaction.commandName === 'rolepanel') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description').replace(/\\n/g, '\n');
        const rolesInput = interaction.options.getString('roles');

        const roleIds = extractRoleIds(rolesInput);
        if (roleIds.length === 0) {
          return interaction.reply({ 
            content: '❌ 有効なロールが見つかりませんでした。', 
            ephemeral: true 
          });
        }
        if (roleIds.length > CONFIG.MAX_ROLES_PER_PANEL) {
          return interaction.reply({ 
            content: `❌ 最大${CONFIG.MAX_ROLES_PER_PANEL}個までです。`, 
            ephemeral: true 
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const botMember = guild.members.me;
        const roles = [];
        const invalidRoles = [];
        const tooHighRoles = [];

        for (const id of roleIds) {
          const role = guild.roles.cache.get(id);
          if (!role) { invalidRoles.push(id); continue; }
          if (role.managed || role.id === guild.roles.everyone.id) { 
            invalidRoles.push(role.name); 
            continue; 
          }
          if (botMember.roles.highest.position <= role.position) { 
            tooHighRoles.push(role.name); 
            continue; 
          }
          roles.push(role);
        }

        if (roles.length === 0) {
          return interaction.editReply({ 
            content: '❌ 有効なロールがありません。' 
          });
        }

        const data = loadData();
        data.counter += 1;
        const panelId = String(data.counter);
        
        const embed = new EmbedBuilder()
          .setColor(CONFIG.DEFAULT_COLOR)
          .setTitle(title)
          .setDescription(description || ' ');

        const select = new StringSelectMenuBuilder()
          .setCustomId(`rolepanel_select_${panelId}`)
          .setPlaceholder('欲しいロールを選択してください')
          .setMinValues(0)
          .setMaxValues(roles.length)
          .addOptions(roles.map((r) => ({ 
            label: r.name.slice(0, 100), 
            value: r.id 
          })));

        const row = new ActionRowBuilder().addComponents(select);
        
        await interaction.channel.send({ 
          embeds: [embed], 
          components: [row] 
        });

        data.panels[panelId] = {
          roleIds: roles.map((r) => r.id),
          type: 'select',
        };
        saveData(data);

        let warning = '';
        if (invalidRoles.length > 0) 
          warning += `\n⚠️ スキップ: ${invalidRoles.join(', ')}`;
        if (tooHighRoles.length > 0) 
          warning += `\n⚠️ BOTより上位: ${tooHighRoles.join(', ')}`;

        await interaction.editReply({ 
          content: `✅ 設置しました！(${roles.length}個)${warning}` 
        });
        return;
      }

      // /verify
      if (interaction.commandName === 'verify') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description').replace(/\\n/g, '\n');
        const rolesInput = interaction.options.getString('roles');

        const roleIds = extractRoleIds(rolesInput);
        if (roleIds.length === 0) {
          return interaction.reply({ 
            content: '❌ 有効なロールが見つかりませんでした。', 
            ephemeral: true 
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const botMember = guild.members.me;
        const roles = [];
        const invalidRoles = [];
        const tooHighRoles = [];

        for (const id of roleIds) {
          const role = guild.roles.cache.get(id);
          if (!role) { invalidRoles.push(id); continue; }
          if (role.managed || role.id === guild.roles.everyone.id) { 
            invalidRoles.push(role.name); 
            continue; 
          }
          if (botMember.roles.highest.position <= role.position) { 
            tooHighRoles.push(role.name); 
            continue; 
          }
          roles.push(role);
        }

        if (roles.length === 0) {
          return interaction.editReply({ 
            content: '❌ 有効なロールがありません。' 
          });
        }

        const data = loadData();
        data.counter += 1;
        const panelId = String(data.counter);
        
        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle(title)
          .setDescription(description || ' ');

        const button = new ButtonBuilder()
          .setCustomId(`verify_button_${panelId}`)
          .setLabel('✅ 認証する')
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);
        
        await interaction.channel.send({ 
          embeds: [embed], 
          components: [row] 
        });

        data.panels[panelId] = {
          roleIds: roles.map((r) => r.id),
          type: 'verify',
        };
        saveData(data);

        await interaction.editReply({ 
          content: `✅ 認証パネルを設置しました！(ロール: ${roles.map(r => r.name).join(', ')})` 
        });
        return;
      }

      // /giveaway
      if (interaction.commandName === 'giveaway') {
        const prize = interaction.options.getString('prize');
        const description = interaction.options.getString('description').replace(/\\n/g, '\n');
        const winners = interaction.options.getInteger('winners');
        const durationInput = interaction.options.getString('duration');
        const boostRolesInput = interaction.options.getString('boost_roles') || '';
        const boostMultiplier = interaction.options.getInteger('boost_multiplier') || 1;

        if (winners < 1 || winners > 10) {
          return interaction.reply({ 
            content: '❌ 当選人数は1〜10人です。', 
            ephemeral: true 
          });
        }

        const durationMs = parseDuration(durationInput);
        if (!durationMs) {
          return interaction.reply({ 
            content: '❌ 期間形式: 30m, 1h, 1d, 1w', 
            ephemeral: true 
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const boostRoleIds = boostRolesInput ? extractRoleIds(boostRolesInput) : [];
        const boostRoles = [];
        
        for (const id of boostRoleIds) {
          const role = interaction.guild.roles.cache.get(id);
          if (role) boostRoles.push(role);
        }

        const data = loadData();
        const giveawayId = `gw_${Date.now()}`;
        const endTime = Date.now() + durationMs;
        
        const embed = new EmbedBuilder()
          .setColor('#0000FF')
          .setTitle(`🎉 ${prize}`)
          .setDescription(description || ' ')
          .addFields(
            { name: '⏰ 終了まで', value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
            { name: '👥 参加人数', value: '0人', inline: true },
            { name: '🎁 当選人数', value: `${winners}人`, inline: true }
          );

        if (boostRoles.length > 0) {
          embed.addFields({
            name: '🚀 ブースト対象',
            value: boostRoles.map(r => `<@&${r.id}> → ${boostMultiplier}倍`).join('\n'),
            inline: false
          });
        }

        const button = new ButtonBuilder()
          .setCustomId(`giveaway_join_${giveawayId}`)
          .setLabel('🎉 参加する')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);
        
        const message = await interaction.channel.send({ 
          embeds: [embed], 
          components: [row] 
        });

        if (!data.giveaways) data.giveaways = {};

        data.giveaways[giveawayId] = {
          prize: prize,
          winners: winners,
          endTime: endTime,
          boostRoleIds: boostRoles.map(r => r.id),
          boostMultiplier: boostMultiplier,
          messageId: message.id,
          channelId: interaction.channel.id,
          participants: [],
          ended: false,
        };
        saveData(data);

        await interaction.editReply({ 
          content: `✅ ギブウェイ開始！\n景品: ${prize}\n当選: ${winners}人\n期間: ${durationInput}` 
        });

        setTimeout(async () => {
          try {
            const currentData = loadData();
            const giveaway = currentData.giveaways[giveawayId];
            
            if (!giveaway || giveaway.ended) return;
            
            giveaway.ended = true;
            currentData.giveaways[giveawayId] = giveaway;
            saveData(currentData);

            const channel = await client.channels.fetch(giveaway.channelId);
            const giveawayMessage = await channel.messages.fetch(giveaway.messageId);

            const participants = giveaway.participants;
            const winnersList = [];
            let entries = [];

            for (const userId of participants) {
              const member = await interaction.guild.members.fetch(userId).catch(() => null);
              if (!member) continue;
              
              let weight = 1;
              for (const roleId of giveaway.boostRoleIds) {
                if (member.roles.cache.has(roleId)) {
                  weight = giveaway.boostMultiplier;
                  break;
                }
              }
              
              for (let i = 0; i < weight; i++) {
                entries.push(userId);
              }
            }

            const uniqueParticipants = [...new Set(participants)];
            while (winnersList.length < Math.min(giveaway.winners, uniqueParticipants.length)) {
              const randomIndex = Math.floor(Math.random() * entries.length);
              const winnerId = entries[randomIndex];
              
              if (!winnersList.includes(winnerId)) {
                winnersList.push(winnerId);
              }
              
              entries = entries.filter(id => id !== winnerId);
              
              if (entries.length === 0) break;
            }

            const resultEmbed = new EmbedBuilder()
              .setColor('#FFD700')
              .setTitle(`🎉 ${giveaway.prize} - 当選者発表！`)
              .setDescription(
                winnersList.length > 0 
                  ? winnersList.map((id, index) => `${index + 1}. <@${id}>`).join('\n')
                  : '参加者がいませんでした。'
              )
              .addFields(
                { name: '👥 参加人数', value: `${uniqueParticipants.length}人`, inline: true },
                { name: '🎁 当選人数', value: `${winnersList.length}人`, inline: true }
              )
              .setTimestamp();

            await giveawayMessage.edit({ 
              embeds: [resultEmbed], 
              components: [] 
            });

            await channel.send({ 
              content: winnersList.length > 0 
                ? `🎉 おめでとう！ ${winnersList.map(id => `<@${id}>`).join(', ')} さんが「${giveaway.prize}」に当選！`
                : 'ギブウェイが終了しました。'
            });

            delete currentData.giveaways[giveawayId];
            saveData(currentData);

          } catch (e) {
            console.error('❌ ギブウェイ終了エラー:', e);
          }
        }, durationMs);

        return;
      }

      // /nuke
      if (interaction.commandName === 'nuke') {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        
        if (!channel || channel.type !== ChannelType.GuildText) {
          return interaction.editReply({ 
            content: '❌ テキストチャンネルでのみ使用できます。' 
          });
        }

        try {
          // チャンネルを複製
          const newChannel = await channel.clone({
            name: channel.name,
            parent: channel.parent,
            topic: channel.topic,
            nsfw: channel.nsfw,
            rateLimitPerUser: channel.rateLimitPerUser,
            position: channel.position,
            permissionOverwrites: channel.permissionOverwrites.cache,
          });

          // 古いチャンネルを削除
          await channel.delete();

          // 新しいチャンネルに通知
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('💥 チャンネルがリセットされました')
            .setDescription('このチャンネルはnukeコマンドによってリセットされました。')
            .setTimestamp();

          await newChannel.send({ embeds: [embed] });

          await interaction.editReply({ 
            content: `✅ チャンネルをリセットしました！\n新しいチャンネル: ${newChannel}` 
          });
        } catch (e) {
          console.error('❌ nukeエラー:', e);
          await interaction.editReply({ 
            content: '❌ チャンネルのリセットに失敗しました。BOTの権限を確認してください。' 
          });
        }
        return;
      }
    }

    // ============================================================
    // ボタン処理（認証パネル）
    // ============================================================
    if (interaction.isButton() && interaction.customId.startsWith('verify_button_')) {
      const panelId = interaction.customId.replace('verify_button_', '');
      const data = loadData();
      const panel = data.panels[panelId];

      if (!panel || panel.type !== 'verify') {
        return interaction.reply({ 
          content: '❌ 設定が見つかりません。', 
          ephemeral: true 
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const member = interaction.member;
      const rolesToAdd = panel.roleIds.filter(id => !member.roles.cache.has(id));

      if (rolesToAdd.length === 0) {
        return interaction.editReply({ 
          content: '✅ すでに認証済みです！' 
        });
      }

      try {
        await member.roles.add(rolesToAdd);

        const roleNames = rolesToAdd
          .map(id => interaction.guild.roles.cache.get(id)?.name)
          .filter(Boolean);

        await interaction.editReply({ 
          content: `✅ 認証完了！\n付与: ${roleNames.join(', ')}` 
        });
      } catch (e) {
        console.error('❌ 認証エラー:', e);
        await interaction.editReply({ 
          content: '❌ ロール付与に失敗しました。' 
        });
      }
      return;
    }

    // ============================================================
    // ボタン処理（ギブウェイ参加）
    // ============================================================
    if (interaction.isButton() && interaction.customId.startsWith('giveaway_join_')) {
      const giveawayId = interaction.customId.replace('giveaway_join_', '');
      const data = loadData();
      
      if (!data.giveaways || !data.giveaways[giveawayId]) {
        return interaction.reply({ 
          content: '❌ このギブウェイは終了しています。', 
          ephemeral: true 
        });
      }
      
      const giveaway = data.giveaways[giveawayId];

      if (giveaway.ended || Date.now() > giveaway.endTime) {
        return interaction.reply({ 
          content: '❌ このギブウェイは終了しています。', 
          ephemeral: true 
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.user.id;

      if (giveaway.participants.includes(userId)) {
        giveaway.participants = giveaway.participants.filter(id => id !== userId);
        data.giveaways[giveawayId] = giveaway;
        saveData(data);

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .spliceFields(1, 1, { 
            name: '👥 参加人数', 
            value: `${giveaway.participants.length}人`, 
            inline: true 
          });

        await interaction.message.edit({ embeds: [updatedEmbed] });

        return interaction.editReply({ 
          content: '✅ 参加を解除しました。' 
        });
      } else {
        giveaway.participants.push(userId);
        data.giveaways[giveawayId] = giveaway;
        saveData(data);

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .spliceFields(1, 1, { 
            name: '👥 参加人数', 
            value: `${giveaway.participants.length}人`, 
            inline: true 
          });

        await interaction.message.edit({ embeds: [updatedEmbed] });

        return interaction.editReply({ 
          content: '✅ 参加しました！' 
        });
      }
    }

    // ============================================================
    // セレクトメニュー処理（ロールパネル）
    // ============================================================
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rolepanel_select_')) {
      const panelId = interaction.customId.replace('rolepanel_select_', '');
      const data = loadData();
      const panel = data.panels[panelId];

      if (!panel || panel.type !== 'select') {
        return interaction.reply({ 
          content: '❌ 設定が見つかりません。', 
          ephemeral: true 
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const member = interaction.member;
      const selectedIds = new Set(interaction.values);
      const panelRoleIds = panel.roleIds;

      const toAdd = panelRoleIds.filter(id => selectedIds.has(id) && !member.roles.cache.has(id));
      const toRemove = panelRoleIds.filter(id => !selectedIds.has(id) && member.roles.cache.has(id));

      try {
        if (toAdd.length > 0) await member.roles.add(toAdd);
        if (toRemove.length > 0) await member.roles.remove(toRemove);

        const addedNames = toAdd
          .map(id => interaction.guild.roles.cache.get(id)?.name)
          .filter(Boolean);
        const removedNames = toRemove
          .map(id => interaction.guild.roles.cache.get(id)?.name)
          .filter(Boolean);

        let content = '✅ 更新しました。';
        if (addedNames.length > 0) content += `\n➕ 付与: ${addedNames.join(', ')}`;
        if (removedNames.length > 0) content += `\n➖ 解除: ${removedNames.join(', ')}`;
        if (addedNames.length === 0 && removedNames.length === 0) 
          content = '変更なし。';

        await interaction.editReply({ content });
      } catch (e) {
        console.error('❌ ロール更新エラー:', e);
        await interaction.editReply({ 
          content: '❌ 更新に失敗しました。' 
        });
      }
      return;
    }
  } catch (error) {
    console.error('❌ エラー:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '❌ エラーが発生しました。', 
          ephemeral: true 
        });
      }
    } catch (e) {
      // 応答できない場合は無視
    }
  }
});

// ============================================================
// エラーハンドリング
// ============================================================
client.on('error', (error) => {
  console.error('❌ クライアントエラー:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ 未処理のPromise拒否:', error);
});

// ============================================================
// ログイン
// ============================================================
client.login(CONFIG.TOKEN).catch((err) => {
  console.error('❌ ログイン失敗:', err);
  console.error('トークンが正しいか確認してください。');
});
