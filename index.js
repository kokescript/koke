// ============================================================
// Discord ロールパネル & 認証ボット
// ============================================================

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, 
  PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ============================================================
// 設定
// ============================================================
const CONFIG = {
  TOKEN: 'MTU0NDcwMTU2NTI2NzYwNzYxMg.GrJEJE.dtBaZtw-f8TPmnV4xX_GXhIQVWOvszWLh_sgls',
  DEFAULT_COLOR: '#00FFFF',
  MAX_ROLES_PER_PANEL: 25,
};

// ============================================================
// データ管理
// ============================================================
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const d = { panels: {}, counter: 0 };
      fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
      return d;
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('❌ データファイル読み込みエラー:', e);
    return { panels: {}, counter: 0 };
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

  // コマンド登録
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
      // 権限チェック
      if (!hasAdminPermission(interaction.member)) {
        return interaction.reply({ 
          content: '❌ このコマンドを実行するには「ロールの管理」権限が必要です！', 
          ephemeral: true 
        });
      }

      // ============================================================
      // /rolepanel コマンド
      // ============================================================
      if (interaction.commandName === 'rolepanel') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description').replace(/\\n/g, '\n');
        const rolesInput = interaction.options.getString('roles');

        const roleIds = extractRoleIds(rolesInput);
        if (roleIds.length === 0) {
          return interaction.reply({ 
            content: '❌ 有効なロールが見つかりませんでした。ロールをメンション（@ロール名）かIDで指定してください。', 
            ephemeral: true 
          });
        }
        if (roleIds.length > CONFIG.MAX_ROLES_PER_PANEL) {
          return interaction.reply({ 
            content: `❌ プルダウンに設定できるロールは最大${CONFIG.MAX_ROLES_PER_PANEL}個までです。`, 
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
            content: '❌ 指定されたロールはすべて無効か、BOTより上位のため設定できませんでした。' 
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
          warning += `\n⚠️ 無効なロールをスキップ: ${invalidRoles.join(', ')}`;
        if (tooHighRoles.length > 0) 
          warning += `\n⚠️ BOTより上位のためスキップ: ${tooHighRoles.join(', ')}`;

        await interaction.editReply({ 
          content: `✅ ロールパネルを設置しました！(${roles.length}個のロール)${warning}` 
        });
        return;
      }

      // ============================================================
      // /verify コマンド
      // ============================================================
      if (interaction.commandName === 'verify') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description').replace(/\\n/g, '\n');
        const rolesInput = interaction.options.getString('roles');

        const roleIds = extractRoleIds(rolesInput);
        if (roleIds.length === 0) {
          return interaction.reply({ 
            content: '❌ 有効なロールが見つかりませんでした。ロールをメンション（@ロール名）かIDで指定してください。', 
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
            content: '❌ 指定されたロールはすべて無効か、BOTより上位のため設定できませんでした。' 
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

        let warning = '';
        if (invalidRoles.length > 0) 
          warning += `\n⚠️ 無効なロールをスキップ: ${invalidRoles.join(', ')}`;
        if (tooHighRoles.length > 0) 
          warning += `\n⚠️ BOTより上位のためスキップ: ${tooHighRoles.join(', ')}`;

        await interaction.editReply({ 
          content: `✅ 認証パネルを設置しました！(ロール: ${roles.map(r => r.name).join(', ')})${warning}` 
        });
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
          content: '❌ この認証パネルの設定が見つかりませんでした。', 
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
          content: `✅ 認証が完了しました！\n付与されたロール: ${roleNames.join(', ')}` 
        });
      } catch (e) {
        console.error('❌ 認証ロール付与エラー:', e);
        await interaction.editReply({ 
          content: '❌ ロールの付与に失敗しました。BOTの権限やロールの順位を確認してください。' 
        });
      }
      return;
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
          content: '❌ このパネルの設定が見つかりませんでした。', 
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

        let content = '✅ ロールを更新しました。';
        if (addedNames.length > 0) content += `\n➕ 付与: ${addedNames.join(', ')}`;
        if (removedNames.length > 0) content += `\n➖ 解除: ${removedNames.join(', ')}`;
        if (addedNames.length === 0 && removedNames.length === 0) 
          content = '変更はありませんでした。';

        await interaction.editReply({ content });
      } catch (e) {
        console.error('❌ ロール更新エラー:', e);
        await interaction.editReply({ 
          content: '❌ ロールの更新に失敗しました。BOTの権限やロールの順位を確認してください。' 
        });
      }
      return;
    }
  } catch (error) {
    console.error('❌ エラー:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ エラーが発生しました。', 
        ephemeral: true 
      }).catch(() => {});
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
