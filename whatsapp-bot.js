const nodeCrypto = require('crypto');
if (!global.crypto) {
    global.crypto = nodeCrypto.webcrypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const { Boom } = require("@hapi/boom");
const fs = require('fs');

async function connectToWhatsApp() {
    const sessionDir = 'session_ultimate_v5';
    
    // إذا حدث خطأ 401 سابقاً، قد نحتاج لمسح المجلد يدوياً (هذا الكود يحاول البدء من جديد)
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log("Initializing Stable Connection...");

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ["Windows", "Chrome", "110.0.0.0"],
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false,
        // منع تحميل الوسائط لتقليل استهلاك الرام
        shouldSyncHistoryMessage: () => false
    });

    sock.ev.on('creds.update', saveCreds);

    let codeSent = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !codeSent) {
            codeSent = true;
            console.log("=== CONNECTION STABLE - PREPARING CODE ===");
            
            // انتظار 20 ثانية لضمان أن السيرفر استقر تماماً
            await delay(20000); 
            
            const phoneNumber = process.env.PHONE_NUMBER;
            if (phoneNumber) {
                try {
                    console.log("ACTION: REQUESTING CODE FOR " + phoneNumber);
                    const code = await sock.requestPairingCode(phoneNumber.replace('+', '').trim());
                    console.log("*********************************");
                    console.log("YOUR FINAL CODE IS: " + code);
                    console.log("*********************************");
                    console.log("PLEASE ENTER IT NOW ON YOUR PHONE!");
                } catch (e) {
                    console.log("Pairing Error: " + e.message);
                    codeSent = false;
                }
            }
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : null;
            
            console.log('Connection closed. Status:', statusCode);
            
            // إذا كان الخطأ 401 أو 408، سننتظر دقيقة كاملة ليرتاح الواتساب
            const delayTime = (statusCode === 401 || statusCode === 408) ? 60000 : 20000;
            console.log(`Waiting ${delayTime/1000}s before next attempt...`);
            
            setTimeout(() => connectToWhatsApp(), delayTime);
        } else if (connection === 'open') {
            console.log("SUCCESS: WHATSAPP IS NOW LIVE!");
            codeSent = false;
        }
    });
}

connectToWhatsApp().catch(err => console.log("Fatal:", err));









