const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process"
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("Scan this QR code (ASCII):");
  qrcode.generate(qr, { small: true });

  // إضافة تأخير بسيط (5 ثوانٍ) قبل طلب رمز الربط لضمان استقرار الاتصال
  const phoneNumber = process.env.PHONE_NUMBER;
  if (phoneNumber) {
    console.log(`Waiting 5 seconds before requesting pairing code for: ${phoneNumber}...`);
    setTimeout(async () => {
      try {
        const pairingCode = await client.requestPairingCode(phoneNumber);
        console.log("==========================================");
        console.log("YOUR WHATSAPP PAIRING CODE:");
        console.log(pairingCode);
        console.log("==========================================");
      } catch (err) {
        console.error("Error requesting pairing code:", err);
      }
    }, 5000);
  }
});

client.on("ready", () => console.log("WhatsApp Bot is ready!"));
client.on("authenticated", () => console.log("Authenticated successfully!"));

const userState = {};

client.on("message", async (msg) => {
  const contact = await msg.getContact();
  const text = msg.body.toLowerCase();
  // ... بقية الكود الخاص بك (لا تقم بتغيير ما بعد هذا السطر)
});

client.initialize();

