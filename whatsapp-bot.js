const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

let pairingCodeRequested = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    // نستخدم المسار الصحيح مباشرة هنا لضمان النجاح
    executablePath: '/usr/bin/google-chrome-stable',
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
    // زيادة الانتظار لـ 15 ثانية لضمان استقرار السيرفر
    console.log(`Waiting 15 seconds before requesting pairing code for: ${phoneNumber}...`);
    
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
        pairingCodeRequested = false; 
      }
    }, 15000);
  }
});

client.on("ready", () => {
  console.log("WhatsApp Bot is ready!");
  pairingCodeRequested = false;
});

client.initialize();

// بقية كود الرسائل يبقى كما هو بالأسفل...


// بقية الكود الخاص بمعالجة الرسائل (client.on("message", ...)) يبقى كما هو تحت هذا السطر

