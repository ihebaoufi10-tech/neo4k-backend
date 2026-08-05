const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

async function connectToWhatsApp() {
    const sessionDir = './session_final';
    const zipPath = './session_final.zip';

    if (fs.existsSync(zipPath) && !fs.existsSync(sessionDir)) {
        console.log("Extracting session files...");
        try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(sessionDir, true);
        } catch (e) { console.error("Extraction error:", e); }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log("🚀 Starting WhatsApp Bot...");

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: true,
        browser: ["Neo4k System", "Chrome", "110.0.0"],
        syncFullHistory: false,
        connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ SUCCESS: WHATSAPP IS ONLINE!');
        }
    });

    // دالة عالمية لإرسال الرسائل سنستخدمها من السيرفر
    global.sendWA = async (jid, text) => {
        try {
            await sock.sendMessage(jid, { text });
            console.log(`Message sent to ${jid}`);
        } catch (e) { console.error("Error sending WA:", e); }
    };
}

connectToWhatsApp().catch(err => console.log("Fatal Error:", err));










