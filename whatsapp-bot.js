const nodeCrypto = require('crypto');
if (!global.crypto) {
    global.crypto = nodeCrypto.webcrypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const { Boom } = require("@hapi/boom");

async function connectToWhatsApp() {
    // تغيير اسم المجلد لـ "session_final_fix" لضمان بداية نظيفة 100%
    const { state, saveCreds } = await useMultiFileAuthState('session_final_fix');
    const { version } = await fetchLatestBaileysVersion();

    console.log("Connecting to WhatsApp (Version: " + version.join('.') + ")...");

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        // استخدام هوية متصفح قياسية جداً
        browser: ["Ubuntu", "Chrome", "110.0.5563.147"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        // إضافة خيار لتقليل الضغط على السيرفر
        shouldIgnoreJid: (jid) => jid.includes('@broadcast')
    });

    sock.ev.on('creds.update', saveCreds);

    let codeRequested = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !codeRequested) {
            codeRequested = true;
            console.log("=== NEW QR READY - STABILIZING FOR 25 SECONDS ===");
            
            const phoneNumber = process.env.PHONE_NUMBER;
            if (phoneNumber) {
                try {
                    // زيادة وقت الانتظار لـ 25 ثانية لضمان استقرار الاتصال بالكامل
                    await delay(25000); 
                    console.log("REQUESTING PAIRING CODE FOR:", phoneNumber);
                    const code = await sock.requestPairingCode(phoneNumber.replace('+', '').trim());
                    console.log("*********************************");
                    console.log("YOUR WHATSAPP CODE IS:", code);
                    console.log("*********************************");
                } catch (e) {
                    console.log("WhatsApp busy. Will try again in the next cycle.");
                    codeRequested = false;
                }
            }
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : null;
            
            console.log('Connection closed. Status:', statusCode, 'Error:', error?.message);
            
            // إذا كان الخطأ 401، سننتظر وقتاً أطول قبل إعادة المحاولة
            const retryDelay = (statusCode === 401) ? 40000 : 20000;
            console.log(`Retrying in ${retryDelay/1000} seconds...`);
            setTimeout(() => connectToWhatsApp(), retryDelay);
        } else if (connection === 'open') {
            console.log("SUCCESS: WHATSAPP CONNECTED!");
            codeRequested = false;
        }
    });
}

connectToWhatsApp().catch(err => console.log("Main Error:", err));







