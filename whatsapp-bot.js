const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

async function connectToWhatsApp() {
    const sessionDir = './session_final';
    const zipPath = './session_final.zip';

    // 1. فك ضغط الجلسة إذا كانت موجودة ولم يتم فكها بعد
    if (fs.existsSync(zipPath) && !fs.existsSync(sessionDir)) {
        console.log("Extracting session files...");
        try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(sessionDir, true);
            console.log("Session extracted successfully.");
        } catch (e) {
            console.error("Extraction error:", e);
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log("Starting WhatsApp Bot with authenticated session...");

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            console.log("Connection closed, reconnecting...");
            setTimeout(connectToWhatsApp, 5000);
        } else if (connection === 'open') {
            console.log("✅ SUCCESS: WHATSAPP IS ONLINE AND READY!");
        }
    });
}

connectToWhatsApp().catch(err => console.log("Fatal Error:", err));









