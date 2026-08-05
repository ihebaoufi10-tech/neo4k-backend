const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

global.waStatus = "Initialisation...";
global.waQR = null;

async function connectToWhatsApp() {
    // Cleanup to force new session if not connected
    if (fs.existsSync('./session_final') && global.waStatus !== "Connecté ✅") {
        try { fs.rmSync('./session_final', { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState('./session_final');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Windows', 'Chrome', '110.0.0.0']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            global.waQR = qr;
            global.waStatus = "En attente de scan QR... 📷";
        }

        if (connection === 'open') {
            global.waStatus = "Connecté ✅";
            global.waQR = null;
        }

        if (connection === 'close') {
            global.waStatus = "Déconnecté ❌";
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    global.sendWA = async (jid, text) => {
        try {
            await sock.sendMessage(jid, { text });
        } catch (e) {
            console.error("Erreur envoi WA:", e);
        }
    };
}

connectToWhatsApp();
module.exports = { connectToWhatsApp };
