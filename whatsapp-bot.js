const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome-stable',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--disable-extensions',
            '--disable-component-update',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-web-security',
            '--font-render-hinting=none',
            '--disable-setuid-sandbox',
            '--disable-render-process-edge-worker',
            '--disable-oopr-debug-crash-dump',
            '--no-crash-upload',
            '--disable-low-res-tiling',
            '--disable-smooth-scrolling',
            '--disable-default-apps',
            '--mute-audio',
            '--hide-scrollbars'
        ],
    },
});

client.on('qr', async (qr) => {
    console.log("QR RECEIVED - Generating Pairing Code...");
    qrcode.generate(qr, { small: true });

    const phoneNumber = process.env.PHONE_NUMBER;
    if (phoneNumber) {
        console.log("Requesting Pairing Code for:", phoneNumber);
        try {
            // انتظار بسيط قبل الطلب لراحة السيرفر
            await new Promise(resolve => setTimeout(resolve, 15000));
            const code = await client.requestPairingCode(phoneNumber);
            console.log("*********************************");
            console.log("YOUR WHATSAPP CODE IS:", code);
            console.log("*********************************");
        } catch (err) {
            console.log("Could not get code, scan QR instead:", err.message);
        }
    }
});

client.on('ready', () => {
    console.log('CLIENT IS READY');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.initialize().catch(err => {
    console.error("INITIALIZATION ERROR:", err.message);
    // إعادة محاولة ذكية بعد 20 ثانية
    setTimeout(() => client.initialize(), 20000);
});



