const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// متغير لمنع تكرار الطلب
let pairingCodeRequested = false;

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
  console.log("QR Code received. Generating ASCII...");
  qrcode.generate(qr, { small: true });

  const phoneNumber = process.env.PHONE_NUMBER;
  if (phoneNumber && !pairingCodeRequested) {
    pairingCodeRequested = true;
    console.log(`Waiting 10 seconds before requesting pairing code for: ${phoneNumber}...`);
    
    setTimeout(async () => {
      try {
        console.log("Sending request for pairing code now...");
        const pairingCode = await client.requestPairingCode(phoneNumber);
        console.log("==========================================");
        console.log("YOUR WHATSAPP PAIRING CODE:");
        console.log(pairingCode);
        console.log("==========================================");
      } catch (err) {
        console.error("Error requesting pairing code:", err);
        pairingCodeRequested = false; // السماح بالمحاولة مرة أخرى في حال الفشل
      }
    }, 10000); // زيادة الوقت لـ 10 ثوانٍ
  }
});

client.on("ready", () => {
  console.log("WhatsApp Bot is ready!");
  pairingCodeRequested = false;
});

client.on("authenticated", () => console.log("Authenticated successfully!"));

client.initialize();

// بقية الكود الخاص بمعالجة الرسائل (client.on("message", ...)) يبقى كما هو تحت هذا السطر

