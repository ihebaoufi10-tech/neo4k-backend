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
      // إضافة هوية متصفح حقيقي لتجنب حظر واتساب
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36"
    ],
  },
});

client.on("qr", async (qr) => {
  console.log("New QR Received. Try to scan or wait for Pairing Code...");
  
  // طباعة الـ QR بشكل أصغر جداً ليناسب شاشة الهاتف
  qrcode.generate(qr, { small: true });

  const phoneNumber = process.env.PHONE_NUMBER;
  if (phoneNumber && !pairingCodeRequested) {
    pairingCodeRequested = true;
    
    // انتظار 30 ثانية لضمان أن واتساب قبل هوية المتصفح الجديدة
    console.log(`Waiting 30 seconds for security check...`);
    
    setTimeout(async () => {
      try {
        console.log("Requesting Pairing Code with Real Browser Identity...");
        const pairingCode = await client.requestPairingCode(phoneNumber);
        console.log("==========================================");
        console.log("SUCCESS! YOUR CODE IS:");
        console.log(pairingCode);
        console.log("==========================================");
      } catch (err) {
        console.error("Pairing code error:", err.message);
        pairingCodeRequested = false; 
      }
    }, 30000);
  }
});

client.on("ready", () => {
  console.log("SUCCESS: WhatsApp Bot is connected and ready!");
  pairingCodeRequested = false;
});

client.initialize().catch(err => console.error("Init Error:", err));


