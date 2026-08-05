// 1. تعريف التشفير بشكل عالمي في أول سطر
const crypto = require('crypto');
global.crypto = crypto; 

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const { Boom } = require("@hapi/boom");

async function connectToWhatsApp() {
    // استخدام اسم مجلد جديد تماماً لمسح أي ملفات تالفة
    const { state, saveCreds } = await useMultiFileAuthState('session_baileys_final');
    const { version } = await fetchLatestBaileysVersion();

    console.log("Starting WhatsApp Connection (Baileys v" + version.join('.') + ")...");

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ["NEO 4K PRO", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("=== NEW QR CODE GENERATED ===");
            qrcode.generate(qr, { small: true });
            
            const phoneNumber = process.env.PHONE_NUMBER;
            if (phoneNumber) {
                try {
                    await delay(20000); // زيادة وقت الانتظار لـ 20 ثانية
                    console.log("Requesting Pairing Code for:", phoneNumber);
                    const code = await sock.requestPairingCode(phoneNumber.replace('+', ''));
                    console.log("*********************************");
                    console.log("YOUR WHATSAPP CODE IS:", code);
                    console.log("*********************************");
                } catch (e) {
                    console.log("WhatsApp busy or rate-limited. Retrying later...");
                }
            }
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : null;
            
            console.log('Connection closed. Status:', statusCode, 'Error:', error?.message);
            
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log("Reconnecting in 15 seconds...");
                setTimeout(() => connectToWhatsApp(), 15000);
            }
        } else if (connection === 'open') {
            console.log("SUCCESS: WHATSAPP CONNECTED!");
        }
    });
}

// تشغيل البوت
connectToWhatsApp().catch(err => console.log("Critical Error:", err));






