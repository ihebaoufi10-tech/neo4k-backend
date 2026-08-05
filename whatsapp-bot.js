const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

let pairingCodeRequested = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
      "--disable-software-rasterizer",
      "--memory-pressure-off"
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("QR Code received.");
  // عرض الـ QR كخيار احتياطي في السجلات
  qrcode.generate(qr, { small: true });

  const phoneNumber = process.env.PHONE_NUMBER;
  if (phoneNumber && !pairingCodeRequested) {
    pairingCodeRequested = true;
    // ننتظر 20 ثانية كاملة ليتنفس السيرفر قبل طلب الرمز
    console.log(`Waiting 20 seconds for stability before requesting code for: ${phoneNumber}...`);
    
    setTimeout(async () => {
      try {
        console.log("Requesting pairing code now...");
        const pairingCode = await client.requestPairingCode(phoneNumber);
        console.log("==========================================");
        console.log("YOUR WHATSAPP PAIRING CODE:");
        console.log(pairingCode);
        console.log("==========================================");
      } catch (err) {
        console.error("Pairing code error:", err.message);
        pairingCodeRequested = false; 
      }
    }, 20000);
  }
});

client.on("ready", () => {
  console.log("WhatsApp Bot is ready!");
  pairingCodeRequested = false;
});

// التعامل مع انقطاع الاتصال
client.on("disconnected", (reason) => {
  console.log("Client was logged out", reason);
  pairingCodeRequested = false;
});

client.initialize().catch(err => {
  console.error("Initialization error:", err);
});


