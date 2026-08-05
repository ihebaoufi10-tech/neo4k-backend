const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

async function connectToWhatsApp() {
    // حفظ الجلسة في مجلد لكي لا يطلب الكود كل مرة
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
            console.log("==========================================");
            console.log("SCAN THIS QR OR USE PAIRING CODE:");
            qrcode.generate(qr, { small: true });
            console.log("==========================================");
            
            const phoneNumber = process.env.PHONE_NUMBER;
            if (phoneNumber) {
                try {
                    await delay(5000);
                    const code = await sock.requestPairingCode(phoneNumber.replace('+', ''));
                    console.log("*********************************");
                    console.log("NEW WHATSAPP CODE IS:", code);
                    console.log("*********************************");
                } catch (e) {
                    console.log("Waiting for WhatsApp to allow new code...");
                }
            }
        }

        if (connection === 'close') {
            console.log("Connection closed, reconnecting...");
            connectToWhatsApp();
        } else if (connection === 'open') {
            console.log("SUCCESS: WHATSAPP CONNECTED!");
        }
    });
}

connectToWhatsApp();



