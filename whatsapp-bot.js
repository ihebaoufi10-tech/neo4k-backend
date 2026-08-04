const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("Scan this QR code (ASCII):");
  qrcode.generate(qr, { small: true });

  // طلب رمز الربط بالهاتف إذا كان الرقم موجوداً في الإعدادات
  const phoneNumber = process.env.PHONE_NUMBER;
  if (phoneNumber) {
    try {
      console.log(`Requesting pairing code for: ${phoneNumber}`);
      const pairingCode = await client.requestPairingCode(phoneNumber);
      console.log("====================================");
      console.log("YOUR WHATSAPP PAIRING CODE IS:");
      console.log(pairingCode);
      console.log("====================================");
    } catch (err) {
      console.error("Error requesting pairing code:", err);
    }
  }
});

client.on("ready", () => console.log("WhatsApp Bot is Ready and Connected!"));
client.on("authenticated", () => console.log("WhatsApp Authenticated!"));

const userState = {};

client.on("message", async (msg) => {
  const contact = await msg.getContact();
  const text = msg.body.toLowerCase();
  const sender = msg.from;

  // مساعدة
  if (text.includes("aide") || text.includes("مساعدة") || text.includes("كيف")) {
    await msg.reply(
      `📺 *NEO 4K PRO - Guide* 📺\n\n` +
        `🤖 *Android:* Code Downloader: 1842729\n` +
        `📺 *Smart TV:* Envoyez *MAC* suivi de votre adresse (ex: MAC 00:11:22...)\n\n` +
        `💡 Test gratuit 5h: *Test*\n` +
        `⚙️ Gérer vos chaînes: *ترتيب القنوات*`
    );
    return;
  }

  // طلب تجربة
  if (text.includes("test") || text.includes("تجربة")) {
    userState[sender] = "awaiting_download";
    await msg.reply("أهلاً بك! هل قمت بتحميل التطبيق؟ (أجب بـ نعم أو Yes)");
    return;
  }

  // تفعيل MAC
  if (text.startsWith("mac ")) {
    await msg.reply(`شكراً! تم استلام عنوان MAC. سنقوم بالتفعيل قريباً.`);
    return;
  }

  // ترتيب القنوات
  if (text.includes("ترتيب القنوات")) {
    userState[sender] = "awaiting_channel_management_request";
    await msg.reply("يرجى تزويدي باسم المستخدم (Username) الخاص باشتراكك.");
    return;
  }

  // معالجة الردود
  if (userState[sender] === "awaiting_download" && (text.includes("yes") || text.includes("نعم"))) {
    await msg.reply("جاري استخراج كود تجريبي... ⏳");
    const sanitizedName = (contact.pushname || "user").replace(/\s+/g, "_").toLowerCase().substring(0, 8) + "_" + contact.number.slice(-4);
    exec(`node "${path.join(__dirname, "automation.js")}" "<LaTex>{sanitizedName}" "test" "add"`, async (error, stdout) => {       const match = stdout.match(/RESULT:(.+)/);       if (match) {         const details = JSON.parse(match[1]);         let res = `✅ *Test 5 Heures Prêt!*\n\n👤 User:</LaTex>{details.username}\n🔑 Pass: <LaTex>{details.password}\n🌐 Host:</LaTex>{details.domain}`;
        if (details.qrLink && details.qrLink !== "No QR/Link found") res += `\n\n🔗 إدارة القنوات: <LaTex>{details.qrLink}`;         await msg.reply(res);       }     });     delete userState[sender];   } else if (userState[sender] === "awaiting_channel_management_request") {     const username = text.trim();     await msg.reply(`جاري البحث عن رابط الإدارة للمستخدم</LaTex>{username}... ⏳`);
    exec(`node "<LaTex>{path.join(__dirname, "automation.js")}" "</LaTex>{username}" "" "get_qr_link"`, async (error, stdout) => {
      const match = stdout.match(/RESULT:(.+)/);
      if (match) {
        const details = JSON.parse(match[1]);
        if (details.qrLink && details.qrLink !== "No QR/Link found") await msg.reply(`✅ رابط إدارة قنواتك: ${details.qrLink}`);
        else await msg.reply("❌ لم يتم العثور على الرابط.");
      }
    });
    delete userState[sender];
  }
});

client.initialize();
