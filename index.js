// ============================================================
// 統合Discordボット（購入/お問い合わせチケット + kokeボット機能）
// ============================================================
//
// 🔐 トークンについての重要な注意
// 元のコードに書かれていたトークンは会話上に貼られたため漏洩済みです。
// Discord Developer Portal → Bot → Reset Token で必ず無効化し、
// 新しいトークンをこのファイルの TOKEN に入れてください。
// できれば直書きせず、環境変数(process.env.DISCORD_TOKEN)を使うことを推奨します。
// ============================================================

const {
  Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder,
  TextInputStyle, Partials,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ============================================================
// 🔐 認証情報
// ============================================================
const TOKEN = process.env.DISCORD_TOKEN || 'ここに新しく再発行したトークンを貼り付けてください';

// ============================================================
// ✨ カスタム絵文字設定
// ============================================================
const EMOJIS = {
  loading: '<a:emoji_7:1510661576250622143>',
  success: '<a:emoji_3:1508380532105416724>',
  error: '❌',
  search: '<a:emoji_5:1510659657230979313>',
  file: '📄',
  forward: '🔄',
  user: '👤',
  time: '🕒',
  stats: '📊',
  flag: '🏁',
  gear: '<a:emoji_7:1510661576250622143>',
  skull: '<a:emoji_8:1510663844866031806>',
  pc: '💻',
  phone: '📱',
  ban: '🔨',
  timeout: '⏱️',
  kick: '👢',
  shield: '🛡️',
  warn: '⚠️',
  purge: '🧹',
  ticket: '🎫',
  lock: '🔒',
  claim: '🙋',
};

// ============================================================
// 🛒 購入チケット設定（旧ticket bot）
// ============================================================
const PURCHASE_GUILD_ID = '1490858207722213437';
const PURCHASE_STAFF_ROLE_ID = '1525800121911218216';

const CATEGORY_BRAINROT = '1526213009595171017';
const CATEGORY_PAYPAY = '1526193451698491442';
const CATEGORY_LTC = '1526193116481323028';
const CATEGORY_ROBUX = '1526530713753751623';
const CATEGORY_INQUIRY = '1526622580616728706';

const PRICE_CHANNEL_ID = '1523276831422288022';
const PRICE_CHANNEL_ID2 = '1511283918077431949';

const PURCHASE_DATA_FILE = path.join(__dirname, 'purchase_data.json');

function loadPurchaseData() {
  try {
    if (!fs.existsSync(PURCHASE_DATA_FILE)) {
      const d = { ticketCounter: 0, panelMessages: {} };
      fs.writeFileSync(PURCHASE_DATA_FILE, JSON.stringify(d, null, 2));
      return d;
    }
    return JSON.parse(fs.readFileSync(PURCHASE_DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('❌ purchase_data.json 読み込みエラー:', e);
    return { ticketCounter: 0, panelMessages: {} };
  }
}
function savePurchaseData(data) {
  try {
    fs.writeFileSync(PURCHASE_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ purchase_data.json 保存エラー:', e);
  }
}

function createPurchasePanel(priceChannelId, title) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `購入する場合は「チケットを作成」を押して作成してください\n値段は <#${priceChannelId}> で確認してください\n\nたくさんの購入お待ちしています`
    )
    .setColor('#2b2d31');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_brainrot').setLabel('brainrot').setEmoji('🧠').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_paypay').setLabel('paypay').setEmoji('💰').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_ltc').setLabel('LTC').setEmoji('🪙').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_robux').setLabel('Robux').setEmoji('⭐').setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row] };
}

function createInquiryPanel() {
  const embed = new EmbedBuilder()
    .setTitle('📞 お問い合わせ')
    .setDescription('お問い合わせパネルです\n無言チケ禁止❌')
    .setColor('#2b2d31');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_bug').setLabel('バグ報告').setEmoji('🐛').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_question').setLabel('質問').setEmoji('❓').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_other').setLabel('その他').setEmoji('📝').setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

async function createInquiryTicket(interaction, categoryId, namePrefix) {
  try {
    const data = loadPurchaseData();
    data.ticketCounter += 1;
    const num = String(data.ticketCounter).padStart(3, '0');
    const channelName = `${namePrefix}-${num}`;
    savePurchaseData(data);

    const guild = interaction.guild;
    const member = interaction.member;
    if (!guild) return interaction.followUp({ content: '❌ サーバー情報が取得できません。', ephemeral: true });

    const category = guild.channels.cache.get(categoryId);
    if (!category) {
      console.error(`❌ カテゴリが見つかりません: ${categoryId}`);
      return interaction.followUp({ content: `❌ カテゴリが見つかりません (ID: ${categoryId})`, ephemeral: true });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: PURCHASE_STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });

    const embed = new EmbedBuilder().setColor('#2b2d31').setDescription('**担当者が来るまでお待ちください**');
    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('purchase_close_ticket').setLabel('クローズ').setStyle(ButtonStyle.Danger)
    );
    await channel.send({ content: `<@${member.id}> welcome!!`, embeds: [embed], components: [closeRow] });

    await interaction.followUp({ content: `✅ チケットを作成しました！ <#${channel.id}>`, ephemeral: true });
  } catch (e) {
    console.error('❌ チケット作成エラー:', e);
    await interaction.followUp({ content: '❌ チケットの作成中にエラーが発生しました。', ephemeral: true });
  }
}

async function createPurchaseTicket(interaction, categoryId, type) {
  try {
    const data = loadPurchaseData();
    data.ticketCounter += 1;
    const num = String(data.ticketCounter).padStart(3, '0');
    const channelName = `ticket-${num}`;
    savePurchaseData(data);

    const guild = interaction.guild;
    const member = interaction.member;
    if (!guild) return interaction.followUp({ content: '❌ サーバー情報が取得できません。', ephemeral: true });

    const category = guild.channels.cache.get(categoryId);
    if (!category) {
      console.error(`❌ カテゴリが見つかりません: ${categoryId}`);
      return interaction.followUp({ content: `❌ カテゴリが見つかりません (ID: ${categoryId})`, ephemeral: true });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: PURCHASE_STAFF_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('purchase_close_ticket').setLabel('クローズ').setStyle(ButtonStyle.Danger)
    );

    if (type === 'robux') {
      await channel.send({ content: `<@${member.id}> welcome!!` });
      await channel.send({ components: [closeRow] });
    } else {
      const embed = new EmbedBuilder().setColor('#2b2d31');
      if (type === 'brainrot') {
        embed.setDescription(
          '**購入に使うbrainrotのスクリーンショットを送ってください**\nPlease send a screenshot of the "brainrot" you\'re using for the purchase.'
        );
      } else if (type === 'paypay') {
        embed.setDescription('**担当者が来るまでお待ちください**');
      } else if (type === 'ltc') {
        embed.setDescription('**Please wait until the person in charge arrives.**');
      }
      await channel.send({ content: `<@${member.id}> welcome!!`, embeds: [embed], components: [closeRow] });
    }

    await interaction.followUp({ content: `✅ チケットを作成しました！ <#${channel.id}>`, ephemeral: true });
  } catch (e) {
    console.error('❌ チケット作成エラー:', e);
    await interaction.followUp({ content: '❌ チケットの作成中にエラーが発生しました。', ephemeral: true });
  }
}

async function deleteOldPurchasePanel(channelId) {
  try {
    const data = loadPurchaseData();
    const messageId = data.panelMessages[channelId];
    if (!messageId) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      delete data.panelMessages[channelId];
      savePurchaseData(data);
      return;
    }
    try {
      const message = await channel.messages.fetch(messageId);
      if (message) await message.delete();
    } catch (e) {
      if (e.code !== 10008) console.error('❌ メッセージ削除エラー:', e);
    }
    delete data.panelMessages[channelId];
    savePurchaseData(data);
  } catch (e) {
    console.error('❌ パネル削除エラー:', e);
  }
}

// ============================================================
// 🎫 新チケットシステム（/ticketpanel）
// ============================================================
const GENERAL_TICKET_DATA_FILE = path.join(__dirname, 'general_ticket_panels.json');
// key: panelMessageId(customId埋め込み用) -> { categoryId, staffRoleId, title }
function loadGeneralPanels() {
  try {
    if (!fs.existsSync(GENERAL_TICKET_DATA_FILE)) {
      fs.writeFileSync(GENERAL_TICKET_DATA_FILE, JSON.stringify({ panels: {}, counter: 0 }, null, 2));
    }
    return JSON.parse(fs.readFileSync(GENERAL_TICKET_DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('❌ general_ticket_panels.json 読み込みエラー:', e);
    return { panels: {}, counter: 0 };
  }
}
function saveGeneralPanels(data) {
  try {
    fs.writeFileSync(GENERAL_TICKET_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ general_ticket_panels.json 保存エラー:', e);
  }
}

// key: channelId -> { ownerId, staffRoleId }
const generalTicketChannels = new Map();

async function openGeneralTicket(interaction, panelId) {
  const data = loadGeneralPanels();
  const panel = data.panels[panelId];
  if (!panel) {
    return interaction.followUp({ content: '❌ このパネルの設定が見つかりませんでした。', ephemeral: true });
  }

  const guild = interaction.guild;
  const user = interaction.user;

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (panel.staffRoleId) {
    overwrites.push({ id: panel.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const safeName = user.username.toLowerCase().replace(/[^a-z0-9\-_]/g, '').slice(0, 20) || 'user';
  const channelOptions = {
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    topic: `ticket-owner:${user.id}`,
  };
  if (panel.categoryId) channelOptions.parent = panel.categoryId;

  const channel = await guild.channels.create(channelOptions);
  generalTicketChannels.set(channel.id, { ownerId: user.id, staffRoleId: panel.staffRoleId || null });

  const embed = new EmbedBuilder()
    .setColor('Aqua')
    .setTitle(`${EMOJIS.ticket} ${panel.title}`)
    .setDescription(`<@${user.id}> さん、お問い合わせありがとうございます。\nスタッフが対応するまで少々お待ちください。`);
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('general_ticket_close').setLabel('クローズ').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
  await channel.send({ content: `<@${user.id}>${panel.staffRoleId ? ` <@&${panel.staffRoleId}>` : ''}`, embeds: [embed], components: [closeRow] });

  await interaction.followUp({ content: `${EMOJIS.success} チケットを作成しました: ${channel}`, ephemeral: true });
}

async function closeGeneralTicket(interaction) {
  const ticket = generalTicketChannels.get(interaction.channel.id);
  const isStaff = ticket && ticket.staffRoleId && interaction.member.roles.cache.has(ticket.staffRoleId);
  const isOwner = ticket && interaction.user.id === ticket.ownerId;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  if (!ticket) {
    return interaction.reply({ content: `${EMOJIS.error} このチャンネルはチケットではありません。`, ephemeral: true });
  }
  if (!isStaff && !isOwner && !isAdmin) {
    return interaction.reply({ content: `${EMOJIS.error} チケットの作成者かスタッフのみクローズできます。`, ephemeral: true });
  }

  await interaction.reply({ content: `${EMOJIS.loading} チケットをクローズしています...` });
  generalTicketChannels.delete(interaction.channel.id);
  setTimeout(() => {
    interaction.channel.delete('チケットクローズ').catch(() => {});
  }, 3000);
}

// ============================================================
// 👋 ようこそ（旧ウェルカム）設定
// ============================================================
const WELCOME_CONFIG_FILE_PATH = path.join(__dirname, 'welcome_config.json');
const DEFAULT_WELCOME_CONFIG = {
  channelId: null,
  message: 'ようこそ {mention} さん！ **{server}** へようこそ！\nあなたは {membercount} 人目のメンバーです🎉',
};
function loadWelcomeConfig() {
  try {
    if (fs.existsSync(WELCOME_CONFIG_FILE_PATH)) {
      const saved = JSON.parse(fs.readFileSync(WELCOME_CONFIG_FILE_PATH, 'utf-8'));
      return { ...DEFAULT_WELCOME_CONFIG, ...saved };
    }
  } catch (e) {
    console.error('[Warning] welcome_config.json の読み込みに失敗しました。', e);
  }
  return { ...DEFAULT_WELCOME_CONFIG };
}
function saveWelcomeConfig() {
  try {
    fs.writeFileSync(WELCOME_CONFIG_FILE_PATH, JSON.stringify(WELCOME_CONFIG, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Error] welcome_config.json の保存に失敗しました。', e);
  }
}
const WELCOME_CONFIG = loadWelcomeConfig();
const applyWelcomeTemplate = (template, member) =>
  template
    .replace(/\{mention\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{membercount\}/g, `${member.guild.memberCount}`);

// ============================================================
// 🎭 リアクションロール設定
// ============================================================
const REACTION_ROLES_FILE_PATH = path.join(__dirname, 'reaction_roles.json');
function loadReactionRoles() {
  try {
    if (fs.existsSync(REACTION_ROLES_FILE_PATH)) return JSON.parse(fs.readFileSync(REACTION_ROLES_FILE_PATH, 'utf-8'));
  } catch (e) {
    console.error('[Warning] reaction_roles.json の読み込みに失敗しました。', e);
  }
  return {};
}
function saveReactionRoles() {
  try {
    fs.writeFileSync(REACTION_ROLES_FILE_PATH, JSON.stringify(REACTION_ROLES, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Error] reaction_roles.json の保存に失敗しました。', e);
  }
}
const REACTION_ROLES = loadReactionRoles();
const normalizeEmojiKey = (emojiString) => {
  const m = emojiString.match(/^<a?:\w+:(\d+)>$/);
  return m ? m[1] : emojiString;
};
const emojiKeyFromReaction = (reactionEmoji) => (reactionEmoji.id ? reactionEmoji.id : reactionEmoji.name);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const visibilityChoice = {
  name: '表示設定',
  description: '結果をみんなに見せるか、自分だけに見せるかを選択します',
  type: 3,
  required: false,
  choices: [
    { name: '👥 みんなに見せる (通常)', value: 'public' },
    { name: '🔒 自分だけに見せる (非表示)', value: 'private' },
  ],
};
const colorChoices = [
  { name: '🟢 緑 (Green)', value: 'Green' },
  { name: '🔴 赤 (Red)', value: 'Red' },
  { name: '🔵 青 (Blue)', value: 'Blue' },
  { name: '🟡 黄色 (Yellow)', value: 'Yellow' },
  { name: '🟣 紫 (Purple)', value: 'Purple' },
  { name: '橙色 (Orange)', value: 'Orange' },
  { name: '💖 ピンク (LuminousVividPink)', value: 'LuminousVividPink' },
  { name: '🌐 水色 (Aqua)', value: 'Aqua' },
  { name: '🪙 金色 (Gold)', value: 'Gold' },
  { name: '⬛ 黒 (DarkButNotBlack)', value: 'DarkButNotBlack' },
];

// key: userId -> Array<{ reason, moderatorId, timestamp }>
const warnData = new Map();

// ============================================================
// 🤖 クライアント
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User],
});

client.once('ready', async () => {
  try {
    console.log(`✅ ${client.user.tag} としてログインしました！`);

    for (const [, guild] of client.guilds.cache) {
      try { await guild.commands.set([]); } catch (e) {}
    }

    await client.application.commands.set([
      // ---- 購入/お問い合わせパネル設置 ----
      { name: 'setup', description: 'チケットパネルを設置します（sourcecode buy + Robux）' },
      { name: 'setup2', description: 'チケットパネルを設置します（koke hub buy）' },
      { name: 'setup3', description: 'チケットパネルを設置します（お問い合わせ）' },

      // ---- 新チケットパネル ----
      {
        name: 'ticketpanel',
        description: '【管理者専用】汎用チケット作成パネルを設置します',
        options: [
          { name: 'title', description: 'パネルのタイトル', type: 3, required: true },
          { name: 'description', description: 'パネルの説明文 (\\nで改行)', type: 3, required: true },
          {
            name: 'category', description: 'チケットを作成する場所（カテゴリー）', type: 7,
            channel_types: [ChannelType.GuildCategory], required: false,
          },
          { name: 'staff_role', description: 'このチケットに対応できるスタッフのロール', type: 8, required: false },
          { name: 'color', description: '色', type: 3, required: false, choices: colorChoices },
        ],
      },

      // ---- kokeボット機能 ----
      {
        name: 'koke_embed',
        description: '文字だけの埋め込みを作成（画像アップロード可）',
        options: [
          { name: 'title', description: 'タイトル', type: 3, required: true },
          { name: 'description', description: '内容 (\\nで改行)', type: 3, required: true },
          { name: 'color', description: '色', type: 3, required: false, choices: colorChoices },
          { name: 'image', description: '画像をフォルダから選んで追加', type: 11, required: false },
        ],
      },
      {
        name: 'koke_ロードストリング',
        description: 'URLからloadstringを生成',
        options: [
          { name: 'url', description: 'スクリプトのURL', type: 3, required: true },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_script',
        description: 'スクリプトを埋め込み表示（画像アップロード可）',
        options: [
          { name: 'title', description: '【必須】埋め込みの題名を入力', type: 3, required: true },
          { name: 'script', description: '【必須】スクリプト本体を貼り付けてください', type: 3, required: true },
          { name: 'color', description: '【任意】色を選択', type: 3, required: false, choices: colorChoices },
          { name: 'image', description: '【任意】画像をフォルダから選んで追加', type: 11, required: false },
        ],
      },
      {
        name: 'koke_user',
        description: '指定したユーザーの詳細情報を表示します',
        options: [
          { name: 'target', description: '調べたいユーザーを選択', type: 6, required: true },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_難読化',
        description: 'Luaスクリプトを難読化して解析されにくくします（ファイル対応）',
        options: [
          { name: 'script', description: '【任意】難読化したいスクリプトを貼り付け', type: 3, required: false },
          { name: 'file', description: '【任意】難読化したいスクリプトファイル（.luaや.txt）', type: 11, required: false },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_ファイル検索',
        description: '大文字小文字を問わずチャンネルの全メッセージからファイルを完全検索します',
        options: [
          { name: 'keyword', description: '【必須】探したいファイル名（の一部）を入力', type: 3, required: true },
          {
            name: 'channel', description: '【任意】検索したいチャンネルを選択（指定しない場合は現在のチャンネル）', type: 7,
            channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement], required: false,
          },
          {
            name: 'destination', description: '【任意】結果の送信先を選択（指定しない場合はこの画面に表示されます）', type: 3, required: false,
            choices: [
              { name: '💬 このチャンネルの画面', value: 'channel' },
              { name: '📬 自分のDMに転送する', value: 'dm' },
            ],
          },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_チャンネル統一',
        description: '【管理者専用】絵文字があるチャンネルを「handle〔絵文字〕┊名前」の形に美しく一括統一します',
        options: [
          {
            name: 'mode', description: '変更を適用する範囲を選択してください', type: 3, required: true,
            choices: [
              { name: '🧪 このチャンネルだけテスト変換する', value: 'single' },
              { name: '🌐 サーバー内のすべてのテキストチャンネルを一括変換する', value: 'all' },
            ],
          },
          visibilityChoice,
        ],
      },
      { name: 'koke_絵文字リスト', description: '【管理者用】このサーバーにある絵文字のIDをすべて書き出します（Nitro不要）', options: [visibilityChoice] },
      {
        name: 'koke_ban',
        description: '【管理者専用】指定したユーザーをサーバーからBANします',
        options: [
          { name: 'target', description: 'BANしたいユーザーを選択', type: 6, required: true },
          { name: 'reason', description: 'BANの理由', type: 3, required: false },
          {
            name: 'delete_messages', description: '直近のメッセージも削除しますか？', type: 3, required: false,
            choices: [
              { name: '削除しない', value: '0' },
              { name: '直近1日分', value: '1' },
              { name: '直近3日分', value: '3' },
              { name: '直近7日分', value: '7' },
            ],
          },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_unban',
        description: '【管理者専用】ユーザーIDを指定してBANを解除します',
        options: [
          { name: 'user_id', description: 'BAN解除したいユーザーのID', type: 3, required: true },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_kick',
        description: '【管理者専用】指定したユーザーをサーバーからキックします',
        options: [
          { name: 'target', description: 'キックしたいユーザーを選択', type: 6, required: true },
          { name: 'reason', description: 'キックの理由', type: 3, required: false },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_timeout',
        description: '【管理者専用】指定したユーザーを一定時間タイムアウトします',
        options: [
          { name: 'target', description: 'タイムアウトしたいユーザーを選択', type: 6, required: true },
          {
            name: 'duration', description: 'タイムアウトする時間を選択', type: 3, required: true,
            choices: [
              { name: '60秒', value: '60' },
              { name: '5分', value: '300' },
              { name: '10分', value: '600' },
              { name: '1時間', value: '3600' },
              { name: '1日', value: '86400' },
              { name: '1週間', value: '604800' },
            ],
          },
          { name: 'reason', description: 'タイムアウトの理由', type: 3, required: false },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_timeout解除',
        description: '【管理者専用】指定したユーザーのタイムアウトを解除します',
        options: [
          { name: 'target', description: 'タイムアウト解除したいユーザーを選択', type: 6, required: true },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_purge',
        description: '【管理者専用】このチャンネルのメッセージをまとめて削除します',
        options: [
          { name: 'count', description: '削除する件数（1〜100）', type: 4, required: true, min_value: 1, max_value: 100 },
          { name: 'target', description: '【任意】特定のユーザーの発言だけ削除', type: 6, required: false },
        ],
      },
      {
        name: 'koke_warn',
        description: '【管理者専用】ユーザーに警告を出し、履歴に記録します',
        options: [
          { name: 'target', description: '警告したいユーザーを選択', type: 6, required: true },
          { name: 'reason', description: '警告の理由', type: 3, required: true },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_warn一覧',
        description: '指定したユーザーの警告履歴を一覧表示します',
        options: [
          { name: 'target', description: '確認したいユーザーを選択', type: 6, required: true },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_warn削除',
        description: '【管理者専用】ユーザーの特定の警告を1件削除します',
        options: [
          { name: 'target', description: '対象ユーザーを選択', type: 6, required: true },
          { name: 'number', description: '削除したい警告の番号（/koke_warn一覧の番号）', type: 4, required: true, min_value: 1 },
          visibilityChoice,
        ],
      },
      {
        name: 'koke_welcome設定',
        description: '【管理者専用】新規参加時の自動ようこそメッセージを設定します',
        options: [
          {
            name: 'channel', description: 'ようこそメッセージを送るチャンネルを選択', type: 7,
            channel_types: [ChannelType.GuildText], required: false,
          },
          { name: 'message', description: 'メッセージ本文。使える文字: {mention} {username} {server} {membercount} (\\nで改行)', type: 3, required: false },
          { name: 'off', description: 'ようこそメッセージ機能をオフにする', type: 5, required: false },
        ],
      },
      { name: 'koke_welcome確認', description: '現在のようこそメッセージ設定を表示します', options: [visibilityChoice] },
      {
        name: 'koke_リアクションロール追加',
        description: '【管理者専用】メッセージに絵文字リアクションでロールを付与する設定を追加します',
        options: [
          { name: 'message_id', description: '対象メッセージのID（メッセージを右クリック→IDをコピー）', type: 3, required: true },
          { name: 'emoji', description: '使う絵文字（ユニコード絵文字 or カスタム絵文字）', type: 3, required: true },
          { name: 'role', description: '付与するロール', type: 8, required: true },
          {
            name: 'channel', description: '対象メッセージがあるチャンネル（未指定なら現在のチャンネル）', type: 7,
            channel_types: [ChannelType.GuildText], required: false,
          },
        ],
      },
      {
        name: 'koke_リアクションロール削除',
        description: '【管理者専用】設定したリアクションロールを1つ削除します',
        options: [
          { name: 'message_id', description: '対象メッセージのID', type: 3, required: true },
          { name: 'emoji', description: '削除したい絵文字', type: 3, required: true },
        ],
      },
      {
        name: 'koke_リアクションロール一覧',
        description: '設定されているリアクションロールを一覧表示します',
        options: [
          { name: 'message_id', description: '【任意】特定のメッセージIDだけ確認したい場合に指定', type: 3, required: false },
          visibilityChoice,
        ],
      },
      { name: 'koke_help', description: 'このボットで使えるコマンドの一覧を表示します', options: [visibilityChoice] },
    ]);

    console.log('✅ スラッシュコマンドを登録しました。');

    const guild = client.guilds.cache.get(PURCHASE_GUILD_ID);
    if (guild) {
      console.log(`📡 購入チケット対象サーバー: ${guild.name} (${guild.id})`);
    }
  } catch (error) {
    console.error('[Error] 起動エラー:', error);
  }
});

// ============================================================
// 👋 ようこそメッセージ
// ============================================================
client.on('guildMemberAdd', async (member) => {
  if (!WELCOME_CONFIG.channelId) return;
  try {
    const channel = await member.guild.channels.fetch(WELCOME_CONFIG.channelId);
    if (!channel) return;
    const text = applyWelcomeTemplate(WELCOME_CONFIG.message, member).replace(/\\n/g, '\n');
    const embed = new EmbedBuilder()
      .setColor('Green')
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `メンバー数: ${member.guild.memberCount}人` });
    await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
  } catch (e) {
    console.error('[Error] ようこそメッセージの送信に失敗しました:', e);
  }
});

// ============================================================
// 🎭 リアクションロール
// ============================================================
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
    const mapping = REACTION_ROLES[reaction.message.id];
    if (!mapping) return;
    const roleId = mapping[emojiKeyFromReaction(reaction.emoji)];
    if (!roleId) return;
    const guild = reaction.message.guild;
    if (!guild) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.add(roleId).catch((e) => console.error('[Error] リアクションロール付与失敗:', e));
  } catch (e) {
    console.error('[Error] messageReactionAdd処理エラー:', e);
  }
});
client.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
    const mapping = REACTION_ROLES[reaction.message.id];
    if (!mapping) return;
    const roleId = mapping[emojiKeyFromReaction(reaction.emoji)];
    if (!roleId) return;
    const guild = reaction.message.guild;
    if (!guild) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.remove(roleId).catch((e) => console.error('[Error] リアクションロール削除失敗:', e));
  } catch (e) {
    console.error('[Error] messageReactionRemove処理エラー:', e);
  }
});

// ============================================================
// 🎮 インタラクション処理
// ============================================================
client.on('interactionCreate', async (interaction) => {
  try {
    const isEphemeral = (inter) => inter.options?.getString?.('表示設定') === 'private';

    // ========================================================
    // スラッシュコマンド
    // ========================================================
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      // ---- 購入/お問い合わせパネル設置 ----
      if (['setup', 'setup2', 'setup3'].includes(name)) {
        let channel = interaction.channel;
        if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
          return interaction.reply({ content: '❌ テキストチャンネルで実行してください。', ephemeral: true });
        }
        await deleteOldPurchasePanel(channel.id);

        let panel;
        if (name === 'setup') panel = createPurchasePanel(PRICE_CHANNEL_ID, '💰sourcecode buy📜');
        else if (name === 'setup2') panel = createPurchasePanel(PRICE_CHANNEL_ID2, 'koke hub buy');
        else panel = createInquiryPanel();

        const sent = await channel.send(panel);
        const data = loadPurchaseData();
        data.panelMessages[channel.id] = sent.id;
        savePurchaseData(data);

        return interaction.reply({ content: `✅ チケットパネルを設置しました！ (<#${channel.id}>)`, ephemeral: true });
      }

      // ---- 新チケットパネル設置 ----
      if (name === 'ticketpanel') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: `${EMOJIS.error} このコマンドを実行するには「チャンネルの管理」権限が必要です！`, ephemeral: true });
        }
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description').replace(/\\n/g, '\n');
        const categoryChannel = interaction.options.getChannel('category');
        const staffRole = interaction.options.getRole('staff_role');
        const color = interaction.options.getString('color') || 'Aqua';

        const panelsData = loadGeneralPanels();
        panelsData.counter += 1;
        const panelId = String(panelsData.counter);
        panelsData.panels[panelId] = {
          title,
          categoryId: categoryChannel ? categoryChannel.id : null,
          staffRoleId: staffRole ? staffRole.id : null,
        };
        saveGeneralPanels(panelsData);

        const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`general_ticket_open_${panelId}`).setLabel('チケットを作成').setEmoji('🎫').setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `${EMOJIS.success} チケットパネルを設置しました。`, ephemeral: true });
      }

      // ---- koke系コマンド ----
      if (name === 'koke_embed') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('color') || 'Green';
        const imageFile = interaction.options.getAttachment('image');
        const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description.replace(/\\n/g, '\n'));
        if (imageFile) embed.setImage(imageFile.url);
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: EMOJIS.gear, ephemeral: true });
        await interaction.deleteReply().catch(() => {});
      }

      else if (name === 'koke_ロードストリング') {
        const url = interaction.options.getString('url');
        const code = `loadstring(game:HttpGet("${url}"))()`;
        const msg = `**${EMOJIS.pc} PC用**\n\`\`\`lua\n${code}\n\`\`\`\n**${EMOJIS.phone} スマホ用**\n\`${code}\``;
        await interaction.reply({ content: msg, ephemeral: isEphemeral(interaction) });
      }

      else if (name === 'koke_script') {
        const title = interaction.options.getString('title');
        const script = interaction.options.getString('script');
        const color = interaction.options.getString('color') || 'Green';
        const imageFile = interaction.options.getAttachment('image');
        const embed = new EmbedBuilder()
          .setColor(color).setTitle(title)
          .setDescription(`**${EMOJIS.pc} PC用**\n\`\`\`lua\n${script}\n\`\`\`\n**${EMOJIS.phone} スマホ用**\n\`${script}\``);
        if (imageFile) embed.setImage(imageFile.url);
        await interaction.channel.send({ embeds: [embed] });
        await interaction.reply({ content: EMOJIS.success, ephemeral: true });
        await interaction.deleteReply().catch(() => {});
      }

      else if (name === 'koke_user') {
        const targetUser = interaction.options.getUser('target');
        const targetMember = interaction.options.getMember('target');
        const createdDate = `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`;
        const joinedDate = targetMember?.joinedTimestamp ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D>` : '情報なし';
        const userEmbed = new EmbedBuilder()
          .setColor('Blue').setTitle(`${targetUser.tag} の詳細情報`)
          .setThumbnail(targetUser.displayAvatarURL())
          .setDescription(`${EMOJIS.user} **ユーザープロフィール**`)
          .addFields(
            { name: '🆔 ユーザーID', value: `\`${targetUser.id}\``, inline: false },
            { name: '🌐 アカウント作成日', value: createdDate, inline: true },
            { name: '📥 サーバー参加日', value: joinedDate, inline: true }
          );
        await interaction.reply({ embeds: [userEmbed], ephemeral: isEphemeral(interaction) });
      }

      else if (name === 'koke_難読化') {
        let scriptText = interaction.options.getString('script');
        const scriptFile = interaction.options.getAttachment('file');
        const hideMe = isEphemeral(interaction);
        if (!scriptText && !scriptFile) {
          return interaction.reply({ content: `${EMOJIS.error} スクリプトを貼り付けるか、ファイルをアップロードしてください！`, ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: hideMe });
        await interaction.editReply({ content: `${EMOJIS.loading} 難読化してます...` });
        if (scriptFile) {
          try {
            const response = await fetch(scriptFile.url);
            scriptText = await response.text();
          } catch (error) {
            return interaction.editReply({ content: `${EMOJIS.error} ファイルの読み込みに失敗しました。` });
          }
        }
        const hexEncoded = Buffer.from(scriptText, 'utf-8').toString('hex');
        const obfuscatedCode = `return(function()local b,J,M,z,h,e,l,L,t,v,w,y=string.byte,string.pack,5,string.gsub,{},loadstring or getfenv()["loadstring"],setmetatable,string.char,unpack,pcall,string.rep,tostring;local function R(T)return(z(T,"..",function(cc)return L(tonumber(cc,16))end))end;v(function()l(R([=[${hexEncoded}]=]))()end)end)()`;
        if (obfuscatedCode.length > 1900) {
          const buffer = Buffer.from(obfuscatedCode, 'utf-8');
          const attachment = new AttachmentBuilder(buffer, { name: 'obfuscated.txt' });
          const embed = new EmbedBuilder().setColor('Green').setTitle('難読化成功')
            .setDescription(`${EMOJIS.success} 難読化が完了しました。\n文字数が多いため、${EMOJIS.file} \`.txt\` ファイルとして出力しています。`);
          await interaction.editReply({ content: null, embeds: [embed], files: [attachment] });
        } else {
          const embed = new EmbedBuilder().setColor('Green').setTitle('難読化成功')
            .setDescription(`${EMOJIS.success} 難読化が完了しました。\n\n**${EMOJIS.pc} 実行用コード**\n\`\`\`lua\n${obfuscatedCode}\n\`\`\``);
          await interaction.editReply({ content: null, embeds: [embed] });
        }
      }

      else if (name === 'koke_ファイル検索') {
        const rawKeyword = interaction.options.getString('keyword');
        const keyword = rawKeyword.toLowerCase();
        const destination = interaction.options.getString('destination') || 'channel';
        const hideMe = isEphemeral(interaction);
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        await interaction.deferReply({ ephemeral: hideMe });
        await interaction.editReply({ content: `${EMOJIS.loading} **ファイル検索中！**\n${targetChannel} のすべてから「${rawKeyword}」を全検索しています。\n\n📊 **現在の進捗:** 準備中...` });

        try {
          let foundFiles = [];
          let lastId = null;
          let totalFetched = 0;
          let loopCount = 0;
          let reachedEnd = false;
          const startTime = Date.now();
          const MAX_TIME_MS = 14 * 60 * 1000;

          const addFoundFile = (attachment, msg, isForwarded = false) => {
            if (attachment.name && attachment.name.toLowerCase().includes(keyword)) {
              const forwardIcon = isForwarded ? `${EMOJIS.forward}(転送) ` : '';
              foundFiles.push(`${EMOJIS.file} **[${forwardIcon}${attachment.name}](${attachment.url})**\n┗ ${EMOJIS.user} 送信者: <@${msg.author.id}> | ${EMOJIS.time} <t:${Math.floor(msg.createdTimestamp / 1000)}:R> | [💬 ジャンプ](${msg.url})`);
            }
          };

          while (true) {
            if (Date.now() - startTime > MAX_TIME_MS) break;
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            const messages = await targetChannel.messages.fetch(options);
            if (messages.size === 0) { reachedEnd = true; break; }

            messages.forEach((msg) => {
              if (msg.attachments && msg.attachments.size > 0) msg.attachments.forEach((a) => addFoundFile(a, msg, false));
              if (msg.messageSnapshots && msg.messageSnapshots.size > 0) {
                msg.messageSnapshots.forEach((snapshot) => {
                  if (snapshot.attachments && snapshot.attachments.size > 0) snapshot.attachments.forEach((a) => addFoundFile(a, msg, true));
                });
              }
            });

            totalFetched += messages.size;
            lastId = messages.last().id;
            loopCount++;

            if (loopCount % 3 === 0) {
              try {
                await interaction.editReply({ content: `${EMOJIS.loading} **ファイル検索中！**\n${targetChannel} のすべてから「${rawKeyword}」を全検索しています。\n\n📊 **現在の進捗:** 過去のメッセージ **${totalFetched} 件** をスキャン済み... (${foundFiles.length} 個発見)` });
              } catch (e) {}
            }
            await sleep(1500);
          }

          const statusText = reachedEnd ? `${EMOJIS.success} はい (最初まで到達)` : `${EMOJIS.error} いいえ (14分経過でストップ)`;

          if (foundFiles.length === 0) {
            return interaction.editReply({ content: `${EMOJIS.error} 過去 **${totalFetched}件** のメッセージを全検査しましたが、「**${rawKeyword}**」を含むファイルは見つかりませんでした。\n\n**【検索ステータス】**\n・${EMOJIS.stats} チェックしたメッセージ量: ${totalFetched} 件\n・${EMOJIS.flag} 全部検査したか: ${statusText}` });
          }

          const ITEMS_PER_PAGE = 7;
          const totalPages = Math.ceil(foundFiles.length / ITEMS_PER_PAGE);
          let currentPage = 0;

          const generateEmbed = (page) => {
            const start = page * ITEMS_PER_PAGE;
            const currentFiles = foundFiles.slice(start, start + ITEMS_PER_PAGE);
            return new EmbedBuilder()
              .setColor('Aqua')
              .setTitle(`「${rawKeyword}」の完全検索結果 (${foundFiles.length}個発見)`)
              .setDescription(`${EMOJIS.search} **検索チャンネル:** ${targetChannel}\n\n**検索結果一覧**\n\n${currentFiles.join('\n\n')}`)
              .addFields(
                { name: `${EMOJIS.stats} 検査したメッセージ量`, value: `${totalFetched} 件`, inline: true },
                { name: `${EMOJIS.flag} 全部検査したか？`, value: statusText, inline: true }
              )
              .setFooter({ text: `ページ ${page + 1} / ${totalPages}` });
          };
          const generateButtons = (page) => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('◀ 前へ').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('next').setLabel('次へ ▶').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1)
          );

          let targetOutput;
          if (destination === 'dm') {
            try {
              targetOutput = await interaction.user.send({
                content: totalPages === 1 ? `${EMOJIS.success} 検索完了！` : `${EMOJIS.success} **${foundFiles.length}個** のファイルが見つかりました！下のボタンで切り替えられます。`,
                embeds: [generateEmbed(0)],
                components: totalPages === 1 ? [] : [generateButtons(0)],
              });
              await interaction.editReply({ content: `${EMOJIS.success} 検索完了！他のメンバーに見られないよう、結果をあなたのDMに送信しました。📬` });
            } catch (dmError) {
              return interaction.editReply({ content: `${EMOJIS.error} DMの送信に失敗しました。あなたの設定で「サーバーメンバーからのダイレクトメッセージを許可する」がオンになっているか確認してください！` });
            }
          } else {
            targetOutput = await interaction.editReply({
              content: totalPages === 1 ? `${EMOJIS.success} 検索完了！` : `${EMOJIS.success} **${foundFiles.length}個** のファイルが見つかりました！下のボタンで切り替えられます。`,
              embeds: [generateEmbed(0)],
              components: totalPages === 1 ? [] : [generateButtons(0)],
            });
          }

          if (totalPages > 1 && targetOutput) {
            const collector = targetOutput.createMessageComponentCollector({ componentType: ComponentType.Button, time: 14 * 60 * 1000 });
            collector.on('collect', async (i) => {
              if (i.customId === 'prev') currentPage--;
              if (i.customId === 'next') currentPage++;
              await i.update({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
            });
            collector.on('end', () => {
              const disabledRow = generateButtons(currentPage);
              disabledRow.components.forEach((c) => c.setDisabled(true));
              if (destination === 'dm') targetOutput.edit({ components: [disabledRow] }).catch(() => {});
              else interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
          }
        } catch (error) {
          console.error(`${EMOJIS.error} 検索エラー:`, error);
          if (error.status === 429) await interaction.editReply({ content: `${EMOJIS.error} DiscordのAPI制限に引っかかりました。少し時間をおいてから再度試してください。` });
          else await interaction.editReply({ content: `${EMOJIS.error} 検索中に予期せぬエラーが発生しました。` });
        }
      }

      else if (name === 'koke_チャンネル統一') {
        const mode = interaction.options.getString('mode');
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has('ManageChannels')) {
          return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行するには「チャンネルの管理」権限が必要です！` });
        }
        const channels = mode === 'single' ? [interaction.channel] : Array.from(interaction.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).values());
        await interaction.editReply({ content: `${EMOJIS.loading} チャンネル名の精密構造解析とフォーマット整形を開始します...\n（※API制限を安全に回避するため少し時間がかかります）` });
        let successCount = 0, skipCount = 0, errorCount = 0;
        for (const channel of channels) {
          const emojiMatch = channel.name.match(/\p{Extended_Pictographic}/u);
          if (!emojiMatch) { skipCount++; continue; }
          const emoji = emojiMatch[0];
          let cleanName = channel.name.replace(/\p{Extended_Pictographic}/gu, '').replace(/[✘〔〕┊｜・─│┃╏\s\-_\/|]/g, '').trim();
          if (!cleanName) cleanName = channel.name.replace(/\p{Extended_Pictographic}/gu, '').trim() || 'channel';
          const newName = `✘〔${emoji}〕┊${cleanName}`;
          if (channel.name === newName) { skipCount++; continue; }
          try {
            await channel.setName(newName);
            successCount++;
            if (mode === 'all') await sleep(3500);
          } catch (err) {
            console.error(`[Error] チャンネル名変更失敗 (${channel.name}):`, err);
            errorCount++;
          }
        }
        await interaction.editReply({ content: `${EMOJIS.success} **チャンネル名のデザイン統一処理が完了しました！**\n\n**【整形実行ステータス】**\n・✨ 美しく統一されたチャンネル: **${successCount} 件**\n・⏩ スキップ (絵文字なし・または変更不要): **${skipCount} 件**\n・❌ エラー: **${errorCount} 件**\n\n※Discordのキャッシュにより、画面上の表記が完全に切り替わるまで数十秒かかる場合があります。` });
      }

      else if (name === 'koke_絵文字リスト') {
        try {
          const emojis = interaction.guild.emojis.cache;
          if (emojis.size === 0) return interaction.reply({ content: `${EMOJIS.error} このサーバーにはカスタム絵文字がまだ登録されていません！`, ephemeral: true });
          let list = [];
          emojis.forEach((emoji) => {
            const animatedPrefix = emoji.animated ? 'a:' : '';
            list.push(`${emoji.toString()} ➔ \`<${animatedPrefix}${emoji.name}:${emoji.id}>\``);
          });
          let description = list.join('\n');
          if (description.length > 3900) description = description.substring(0, 3800) + '\n...(省略) 量が多すぎます。';
          const embed = new EmbedBuilder().setColor('Gold').setTitle('🎫 サーバーカスタム絵文字 IDリスト')
            .setDescription(`グレーの枠内の文字列をコピーして、コード上部の \`EMOJIS\` に貼り付けてください！\n\n${description}`);
          await interaction.reply({ embeds: [embed], ephemeral: isEphemeral(interaction) });
        } catch (error) {
          console.error(error);
          await interaction.reply({ content: `${EMOJIS.error} 絵文字の取得に失敗しました。`, ephemeral: true });
        }
      }

      else if (name === 'koke_ban') {
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行するには「メンバーをBAN」権限が必要です！` });
        const targetUser = interaction.options.getUser('target');
        const targetMember = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || '理由なし';
        const deleteDays = parseInt(interaction.options.getString('delete_messages') || '0', 10);
        if (targetUser.id === interaction.user.id) return interaction.editReply({ content: `${EMOJIS.error} 自分自身をBANすることはできません！` });
        if (targetMember && !targetMember.bannable) return interaction.editReply({ content: `${EMOJIS.error} このユーザーはBOTより上位の権限を持っているため、BANできません。` });
        try {
          await interaction.guild.members.ban(targetUser.id, { reason: `${reason} (実行者: ${interaction.user.tag})`, deleteMessageSeconds: deleteDays * 24 * 60 * 60 });
          const embed = new EmbedBuilder().setColor('Red').setTitle(`${EMOJIS.ban} BAN実行`).setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              { name: '🆔 対象ユーザー', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
              { name: '📝 理由', value: reason, inline: true },
              { name: '👮 実行者', value: `${interaction.user.tag}`, inline: true }
            );
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error(`${EMOJIS.error} BANエラー:`, error);
          await interaction.editReply({ content: `${EMOJIS.error} BANの実行に失敗しました。BOTの権限やロールの順位を確認してください。` });
        }
      }

      else if (name === 'koke_unban') {
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行するには「メンバーをBAN」権限が必要です！` });
        const userId = interaction.options.getString('user_id').trim();
        if (!/^\d{15,25}$/.test(userId)) return interaction.editReply({ content: `${EMOJIS.error} 有効なユーザーIDを入力してください（数字のみ）。` });
        try {
          const bans = await interaction.guild.bans.fetch();
          if (!bans.has(userId)) return interaction.editReply({ content: `${EMOJIS.error} このIDはBANリストに存在しません。` });
          await interaction.guild.members.unban(userId, `実行者: ${interaction.user.tag}`);
          const embed = new EmbedBuilder().setColor('Green').setTitle(`${EMOJIS.success} BAN解除完了`)
            .addFields({ name: '🆔 対象ユーザーID', value: `${userId}`, inline: false }, { name: '👮 実行者', value: `${interaction.user.tag}`, inline: true });
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error(`${EMOJIS.error} BAN解除エラー:`, error);
          await interaction.editReply({ content: `${EMOJIS.error} BAN解除に失敗しました。` });
        }
      }

      else if (name === 'koke_kick') {
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行するには「メンバーをキック」権限が必要です！` });
        const targetUser = interaction.options.getUser('target');
        const targetMember = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || '理由なし';
        if (targetUser.id === interaction.user.id) return interaction.editReply({ content: `${EMOJIS.error} 自分自身をキックすることはできません！` });
        if (!targetMember) return interaction.editReply({ content: `${EMOJIS.error} このユーザーはサーバーに存在しません。` });
        if (!targetMember.kickable) return interaction.editReply({ content: `${EMOJIS.error} このユーザーはBOTより上位の権限を持っているため、キックできません。` });
        try {
          await targetMember.kick(`${reason} (実行者: ${interaction.user.tag})`);
          const embed = new EmbedBuilder().setColor('Orange').setTitle(`${EMOJIS.kick} キック実行`).setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              { name: '🆔 対象ユーザー', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
              { name: '📝 理由', value: reason, inline: true },
              { name: '👮 実行者', value: `${interaction.user.tag}`, inline: true }
            );
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error(`${EMOJIS.error} キックエラー:`, error);
          await interaction.editReply({ content: `${EMOJIS.error} キックの実行に失敗しました。` });
        }
      }

      else if (name === 'koke_timeout') {
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行するには「メンバーをタイムアウト」権限が必要です！` });
        const targetUser = interaction.options.getUser('target');
        const targetMember = interaction.options.getMember('target');
        const durationSeconds = parseInt(interaction.options.getString('duration'), 10);
        const reason = interaction.options.getString('reason') || '理由なし';
        if (targetUser.id === interaction.user.id) return interaction.editReply({ content: `${EMOJIS.error} 自分自身をタイムアウトすることはできません！` });
        if (!targetMember) return interaction.editReply({ content: `${EMOJIS.error} このユーザーはサーバーに存在しません。` });
        if (!targetMember.moderatable) return interaction.editReply({ content: `${EMOJIS.error} このユーザーはBOTより上位の権限を持っているため、タイムアウトできません。` });
        try {
          await targetMember.timeout(durationSeconds * 1000, `${reason} (実行者: ${interaction.user.tag})`);
          const untilTimestamp = Math.floor(Date.now() / 1000) + durationSeconds;
          const embed = new EmbedBuilder().setColor('Yellow').setTitle(`${EMOJIS.timeout} タイムアウト実行`).setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              { name: '🆔 対象ユーザー', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
              { name: '⏳ 解除予定', value: `<t:${untilTimestamp}:R>`, inline: true },
              { name: '📝 理由', value: reason, inline: true },
              { name: '👮 実行者', value: `${interaction.user.tag}`, inline: true }
            );
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error(`${EMOJIS.error} タイムアウトエラー:`, error);
          await interaction.editReply({ content: `${EMOJIS.error} タイムアウトの実行に失敗しました。` });
        }
      }

      else if (name === 'koke_timeout解除') {
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行するには「メンバーをタイムアウト」権限が必要です！` });
        const targetUser = interaction.options.getUser('target');
        const targetMember = interaction.options.getMember('target');
        if (!targetMember) return interaction.editReply({ content: `${EMOJIS.error} このユーザーはサーバーに存在しません。` });
        try {
          await targetMember.timeout(null, `タイムアウト解除 (実行者: ${interaction.user.tag})`);
          const embed = new EmbedBuilder().setColor('Green').setTitle(`${EMOJIS.success} タイムアウト解除完了`)
            .addFields({ name: '🆔 対象ユーザー', value: `${targetUser.tag} (${targetUser.id})`, inline: false }, { name: '👮 実行者', value: `${interaction.user.tag}`, inline: true });
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error(`${EMOJIS.error} タイムアウト解除エラー:`, error);
          await interaction.editReply({ content: `${EMOJIS.error} タイムアウト解除に失敗しました。` });
        }
      }

      else if (name === 'koke_purge') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: `${EMOJIS.error} このコマンドを実行するには「メッセージの管理」権限が必要です！`, ephemeral: true });
        const count = interaction.options.getInteger('count');
        const targetUser = interaction.options.getUser('target');
        await interaction.deferReply({ ephemeral: true });
        try {
          const messages = await interaction.channel.messages.fetch({ limit: 100 });
          let toDelete = Array.from(messages.values());
          if (targetUser) toDelete = toDelete.filter((m) => m.author.id === targetUser.id);
          toDelete = toDelete.slice(0, count);
          if (toDelete.length === 0) return interaction.editReply({ content: `${EMOJIS.error} 削除できるメッセージが見つかりませんでした（14日以上前のメッセージは一括削除できません）。` });
          const deleted = await interaction.channel.bulkDelete(toDelete, true);
          const embed = new EmbedBuilder().setColor('Green').setTitle(`${EMOJIS.purge} メッセージ削除完了`)
            .setDescription(`${deleted.size} 件のメッセージを削除しました。${targetUser ? `\n対象: ${targetUser.tag}` : ''}`);
          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          console.error(`${EMOJIS.error} purgeエラー:`, error);
          await interaction.editReply({ content: `${EMOJIS.error} メッセージの削除に失敗しました。14日以上前のメッセージは一括削除できない点にご注意ください。` });
        }
      }

      else if (name === 'koke_warn') {
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行するには「メンバーをタイムアウト」または「メッセージの管理」権限が必要です！` });
        }
        const targetUser = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');
        if (targetUser.id === interaction.user.id) return interaction.editReply({ content: `${EMOJIS.error} 自分自身に警告はできません！` });
        if (!warnData.has(targetUser.id)) warnData.set(targetUser.id, []);
        const warnList = warnData.get(targetUser.id);
        warnList.push({ reason, moderatorId: interaction.user.id, timestamp: Date.now() });
        const embed = new EmbedBuilder().setColor('Yellow').setTitle(`${EMOJIS.warn} 警告を記録しました`).setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: '🆔 対象ユーザー', value: `${targetUser.tag} (${targetUser.id})`, inline: false },
            { name: '📝 理由', value: reason, inline: true },
            { name: '🔢 累計警告数', value: `${warnList.length} 回`, inline: true },
            { name: '👮 実行者', value: `${interaction.user.tag}`, inline: true }
          );
        await interaction.editReply({ embeds: [embed] });
        try { await targetUser.send({ content: `${EMOJIS.warn} サーバーで警告を受けました。\n**理由:** ${reason}` }); } catch (e) {}
      }

      else if (name === 'koke_warn一覧') {
        const hideMe = isEphemeral(interaction);
        const targetUser = interaction.options.getUser('target');
        const warnList = warnData.get(targetUser.id) || [];
        if (warnList.length === 0) return interaction.reply({ content: `${EMOJIS.success} ${targetUser.tag} さんに警告履歴はありません。`, ephemeral: hideMe });
        const description = warnList.map((w, i) => `**#${i + 1}** | <t:${Math.floor(w.timestamp / 1000)}:D>\n┗ 理由: ${w.reason}\n┗ 実行者: <@${w.moderatorId}>`).join('\n\n');
        const embed = new EmbedBuilder().setColor('Yellow').setTitle(`${EMOJIS.warn} ${targetUser.tag} の警告履歴 (${warnList.length}件)`).setThumbnail(targetUser.displayAvatarURL()).setDescription(description);
        await interaction.reply({ embeds: [embed], ephemeral: hideMe });
      }

      else if (name === 'koke_warn削除') {
        const hideMe = isEphemeral(interaction);
        await interaction.deferReply({ ephemeral: hideMe });
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers) && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.editReply({ content: `${EMOJIS.error} このコマンドを実行する権限がありません！` });
        }
        const targetUser = interaction.options.getUser('target');
        const number = interaction.options.getInteger('number');
        const warnList = warnData.get(targetUser.id) || [];
        if (number < 1 || number > warnList.length) return interaction.editReply({ content: `${EMOJIS.error} その番号の警告は存在しません。/koke_warn一覧 で番号を確認してください。` });
        const removed = warnList.splice(number - 1, 1)[0];
        await interaction.editReply({ content: `${EMOJIS.success} ${targetUser.tag} さんの警告 #${number}（理由: ${removed.reason}）を削除しました。残り ${warnList.length} 件。` });
      }

      else if (name === 'koke_welcome設定') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: `${EMOJIS.error} このコマンドを実行するには「サーバー管理」権限が必要です！`, ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const turnOff = interaction.options.getBoolean('off');
        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        if (turnOff) {
          WELCOME_CONFIG.channelId = null;
          saveWelcomeConfig();
          return interaction.editReply({ content: `${EMOJIS.success} ようこそメッセージ機能をオフにしました。` });
        }
        if (channel) WELCOME_CONFIG.channelId = channel.id;
        if (message) WELCOME_CONFIG.message = message;
        saveWelcomeConfig();
        const embed = new EmbedBuilder().setColor('Green').setTitle(`${EMOJIS.success} ようこそメッセージ設定を更新しました`)
          .addFields(
            { name: '📢 送信チャンネル', value: WELCOME_CONFIG.channelId ? `<#${WELCOME_CONFIG.channelId}>` : '未設定（機能オフ）', inline: false },
            { name: '📝 メッセージ内容', value: WELCOME_CONFIG.message, inline: false }
          )
          .setFooter({ text: '使えるプレースホルダー: {mention} {username} {server} {membercount}' });
        await interaction.editReply({ embeds: [embed] });
      }

      else if (name === 'koke_welcome確認') {
        const hideMe = isEphemeral(interaction);
        const embed = new EmbedBuilder().setColor('Aqua').setTitle('👋 現在のようこそメッセージ設定')
          .addFields(
            { name: '📢 送信チャンネル', value: WELCOME_CONFIG.channelId ? `<#${WELCOME_CONFIG.channelId}>` : '未設定（機能オフ）', inline: false },
            { name: '📝 メッセージ内容', value: WELCOME_CONFIG.message, inline: false }
          )
          .setFooter({ text: '設定を変更するには /koke_welcome設定 を使ってください。' });
        await interaction.reply({ embeds: [embed], ephemeral: hideMe });
      }

      else if (name === 'koke_リアクションロール追加') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: `${EMOJIS.error} このコマンドを実行するには「ロールの管理」権限が必要です！`, ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        const messageId = interaction.options.getString('message_id').trim();
        const emojiInput = interaction.options.getString('emoji').trim();
        const role = interaction.options.getRole('role');
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        if (role.managed || role.id === interaction.guild.roles.everyone.id) return interaction.editReply({ content: `${EMOJIS.error} このロールは付与できません（BOT専用ロールか@everyoneです）。` });
        const botMember = interaction.guild.members.me;
        if (botMember.roles.highest.position <= role.position) return interaction.editReply({ content: `${EMOJIS.error} このロールはBOTのロールより上位のため付与できません。BOTのロールを対象ロールより上に移動してください。` });
        try {
          const message = await targetChannel.messages.fetch(messageId);
          await message.react(emojiInput);
          const key = normalizeEmojiKey(emojiInput);
          if (!REACTION_ROLES[message.id]) REACTION_ROLES[message.id] = {};
          REACTION_ROLES[message.id][key] = role.id;
          saveReactionRoles();
          await interaction.editReply({ content: `${EMOJIS.success} 設定完了！ ${targetChannel} のメッセージに ${emojiInput} を付けると <@&${role.id}> ロールが付与されます。` });
        } catch (error) {
          console.error(`${EMOJIS.error} リアクションロール追加エラー:`, error);
          await interaction.editReply({ content: `${EMOJIS.error} メッセージが見つからないか、絵文字/権限に問題があります。message_idとchannelを確認してください。` });
        }
      }

      else if (name === 'koke_リアクションロール削除') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: `${EMOJIS.error} このコマンドを実行するには「ロールの管理」権限が必要です！`, ephemeral: true });
        }
        const messageId = interaction.options.getString('message_id').trim();
        const emojiInput = interaction.options.getString('emoji').trim();
        const key = normalizeEmojiKey(emojiInput);
        if (!REACTION_ROLES[messageId] || !REACTION_ROLES[messageId][key]) return interaction.reply({ content: `${EMOJIS.error} 該当する設定が見つかりませんでした。`, ephemeral: true });
        delete REACTION_ROLES[messageId][key];
        if (Object.keys(REACTION_ROLES[messageId]).length === 0) delete REACTION_ROLES[messageId];
        saveReactionRoles();
        await interaction.reply({ content: `${EMOJIS.success} リアクションロール設定を削除しました。`, ephemeral: true });
      }

      else if (name === 'koke_リアクションロール一覧') {
        const hideMe = isEphemeral(interaction);
        const filterMessageId = interaction.options.getString('message_id');
        const entries = filterMessageId ? (REACTION_ROLES[filterMessageId] ? { [filterMessageId]: REACTION_ROLES[filterMessageId] } : {}) : REACTION_ROLES;
        const messageIds = Object.keys(entries);
        if (messageIds.length === 0) return interaction.reply({ content: `${EMOJIS.error} 設定されているリアクションロールはありません。`, ephemeral: hideMe });
        const description = messageIds.map((msgId) => {
          const roles = Object.entries(entries[msgId]).map(([emojiKey, roleId]) => `${/^\d+$/.test(emojiKey) ? `<:emoji:${emojiKey}>` : emojiKey} → <@&${roleId}>`).join('\n');
          return `**メッセージID: \`${msgId}\`**\n${roles}`;
        }).join('\n\n');
        const embed = new EmbedBuilder().setColor('Gold').setTitle('🎭 設定済みリアクションロール一覧').setDescription(description.length > 4000 ? description.slice(0, 3900) + '\n...(省略)' : description);
        await interaction.reply({ embeds: [embed], ephemeral: hideMe });
      }

      else if (name === 'koke_help') {
        const hideMe = isEphemeral(interaction);
        const embed = new EmbedBuilder()
          .setColor('Blue').setTitle('📖 コマンド一覧').setDescription('このボットで使えるコマンドをまとめました。')
          .addFields(
            { name: '🎫 チケット', value: '`/setup` `/setup2` `/setup3` 購入・お問い合わせパネル設置\n`/ticketpanel` 汎用チケットパネル設置' },
            { name: '📄 埋め込み・スクリプト表示', value: '`/koke_embed` 文字だけの埋め込みを作成\n`/koke_script` スクリプトを埋め込み表示\n`/koke_ロードストリング` URLからloadstringを生成\n`/koke_難読化` Luaスクリプトを難読化\n`/koke_ファイル検索` チャンネル内のファイルを検索' },
            { name: '🛡️ モデレーション', value: '`/koke_ban` `/koke_unban` `/koke_kick`\n`/koke_timeout` `/koke_timeout解除`\n`/koke_warn` `/koke_warn一覧` `/koke_warn削除`\n`/koke_purge`' },
            { name: '👋 ようこそ & 🎭 リアクションロール', value: '`/koke_welcome設定` `/koke_welcome確認`\n`/koke_リアクションロール追加` `/削除` `/一覧`' },
            { name: '🔧 その他', value: '`/koke_user` `/koke_チャンネル統一` `/koke_絵文字リスト` `/koke_help`' }
          )
          .setFooter({ text: '各コマンドの詳細なオプションは、コマンド入力時にDiscordの説明欄で確認できます。' });
        await interaction.reply({ embeds: [embed], ephemeral: hideMe });
      }

      return;
    }

    // ========================================================
    // ボタン
    // ========================================================
    if (interaction.isButton()) {
      // ---- 新チケットパネル：開く ----
      if (interaction.customId.startsWith('general_ticket_open_')) {
        const panelId = interaction.customId.replace('general_ticket_open_', '');
        await interaction.deferReply({ ephemeral: true });
        try {
          await openGeneralTicket(interaction, panelId);
        } catch (error) {
          console.error('❌ チケット作成エラー:', error);
          await interaction.followUp({ content: `${EMOJIS.error} チケットの作成に失敗しました。BOTの権限を確認してください。`, ephemeral: true });
        }
        return;
      }
      if (interaction.customId === 'general_ticket_close') {
        await closeGeneralTicket(interaction);
        return;
      }

      // ---- お問い合わせ（購入bot側）確認ダイアログ ----
      if (['ticket_bug', 'ticket_question', 'ticket_other'].includes(interaction.customId)) {
        const typeMap = { ticket_bug: { label: 'バグ報告' }, ticket_question: { label: '質問' }, ticket_other: { label: 'その他' } };
        const info = typeMap[interaction.customId];
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`confirm_inquiry_${interaction.customId}`).setLabel('はい').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`cancel_inquiry_${interaction.customId}`).setLabel('いいえ').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: `⚠️ **${info.label}チケットを作成しますか？**`, components: [confirmRow], ephemeral: true });
        return;
      }
      if (interaction.customId.startsWith('confirm_inquiry_')) {
        const originalId = interaction.customId.replace('confirm_inquiry_', '');
        const prefixMap = { ticket_bug: 'bug', ticket_question: 'question', ticket_other: 'other' };
        await interaction.update({ content: '✅ チケットを作成しています...', components: [], ephemeral: true });
        await createInquiryTicket(interaction, CATEGORY_INQUIRY, prefixMap[originalId]);
        return;
      }
      if (interaction.customId.startsWith('cancel_inquiry_')) {
        await interaction.update({ content: '❌ キャンセルしました。', components: [], ephemeral: true });
        return;
      }

      // ---- 購入チケット ----
      if (interaction.customId === 'ticket_robux') {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_robux_yes').setLabel('はい').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('confirm_robux_no').setLabel('いいえ').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({ content: '⚠️ **あなたはプラスに入ってますか？そうじゃないとRobuxが渡せません**', components: [confirmRow], ephemeral: true });
        return;
      }
      if (interaction.customId === 'confirm_robux_yes') {
        await interaction.update({ content: '✅ チケットを作成しています...', components: [], ephemeral: true });
        await createPurchaseTicket(interaction, CATEGORY_ROBUX, 'robux');
        return;
      }
      if (interaction.customId === 'confirm_robux_no') {
        await interaction.update({ content: '❌ キャンセルしました。', components: [], ephemeral: true });
        return;
      }
      if (['ticket_brainrot', 'ticket_paypay', 'ticket_ltc'].includes(interaction.customId)) {
        await interaction.deferReply({ ephemeral: true });
        const categoryMap = {
          ticket_brainrot: { cat: CATEGORY_BRAINROT, type: 'brainrot' },
          ticket_paypay: { cat: CATEGORY_PAYPAY, type: 'paypay' },
          ticket_ltc: { cat: CATEGORY_LTC, type: 'ltc' },
        };
        const target = categoryMap[interaction.customId];
        await createPurchaseTicket(interaction, target.cat, target.type);
        return;
      }

      // ---- 購入チケットクローズ ----
      if (interaction.customId === 'purchase_close_ticket') {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('purchase_confirm_close').setLabel('はい').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('purchase_cancel_close').setLabel('いいえ').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: '⚠️ **本当にクローズしますか？**', components: [confirmRow], ephemeral: true });
        return;
      }
      if (interaction.customId === 'purchase_confirm_close') {
        await interaction.update({ content: '🗑️ チケットを削除しています...', components: [], ephemeral: true });
        const channel = interaction.channel;
        if (channel) await channel.delete().catch(() => {});
        return;
      }
      if (interaction.customId === 'purchase_cancel_close') {
        await interaction.update({ content: '❌ キャンセルしました。', components: [], ephemeral: true });
        return;
      }
    }
  } catch (error) {
    console.error('❌ エラー:', error);
  }
});

client.login(TOKEN).catch((err) => {
  console.error('❌ ログイン失敗:', err);
});
