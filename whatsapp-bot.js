const nodeCrypto = require('crypto');
if (!global.crypto) {
    global.crypto = nodeCrypto.webcrypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const { Boom } = require("@hapi/boom");

async function connectToWhatsApp() {
    // استخدام اسم مجلد جديد كلياً لمسح أي محاولات فاشلة
    const { state, saveCreds } = await useMultiFileAuthState('session_fast_connect');
    const { version } = await fetchLatestBaileysVersion();

    console.log("Fast Connect Starting...");

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ["Windows", "Chrome", "110.0.0.0"],
        // إعدادات السرعة القصوى
        connectTimeoutMs: 120000, // زيادة الوقت لـ 120 ثانية
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false, // لا نريد أي رسائل قديمة
        linkPreview: false, // لا نريد معاينة الروابط
        getMessage: async (key) => { return { conversation: 'Welcome' } }
    });

    sock.ev.on('creds.update', saveCreds);

    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !codeSent) {
            codeSent = true;
            // تقليل وقت الانتظار لـ 10 ثواني فقط لربح الوقت
            await delay(10000); 
            const phoneNumber = process.env.PHONE_NUMBER;
            if (phoneNumber) {
                try {
                    console.log("REQUESTING CODE NOW...");
                    const code = await sock.requestPairingCode(phoneNumber.replace('+', '').trim());
                    console.log("*********************************");
                    console.log("YOUR CODE IS:", code);
                    console.log("*********************************");
                } catch (e) {
                    codeSent = false;
                }
            }
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : null;
            console.log('Closed. Status:', statusCode);
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(() => connectToWhatsApp(), 10000);
            }
        } else if (connection === 'open') {
            console.log("SUCCESS: WHATSAPP CONNECTED!");
            codeSent = false;
        }
    });
}

connectToWhatsApp().catch(err => console.log("Error:", err));








