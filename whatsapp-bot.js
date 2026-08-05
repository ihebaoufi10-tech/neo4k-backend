const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ["NEO 4K PRO", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("=== SCAN QR OR WAIT FOR CODE ===");
            qrcode.generate(qr, { small: true });
            
            const phoneNumber = process.env.PHONE_NUMBER;
            if (phoneNumber) {
                try {
                    // انتظار 10 ثواني لضمان استقرار الاتصال
                    await delay(10000);
                    console.log("Requesting Pairing Code for:", phoneNumber);
                    const code = await sock.requestPairingCode(phoneNumber.replace('+', ''));
                    console.log("*********************************");
                    console.log("YOUR NEW WHATSAPP CODE IS:", code);
                    console.log("*********************************");
                } catch (e) {
                    console.log("WhatsApp busy, will retry in 30s...");
                }
            }
        }

        if (connection === 'close') {
            console.log("Connection closed, reconnecting...");
            setTimeout(() => connectToWhatsApp(), 5000);
        } else if (connection === 'open') {
            console.log("SUCCESS: WHATSAPP CONNECTED!");
        }
    });
}

connectToWhatsApp();




