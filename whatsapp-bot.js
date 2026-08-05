const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

global.waStatus = "Initialisation...";
global.waPairingCode = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./session_final');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Neo4k Admin", "Chrome", "110.0.0"]
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            global.waStatus = "Connecté ✅";
            global.waPairingCode = null;
            console.log('✅ WHATSAPP CONNECTÉ !');
        }
        if (connection === 'close') {
            global.waStatus = "Déconnecté ❌";
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        }
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode("213564653328");
                global.waPairingCode = code;
                global.waStatus = "En attente de couplage... 🔑";
                console.log("CODE WHATSAPP:", code);
            } catch (e) {
                console.error("Error requesting pairing code:", e);
            }
        }, 5000);
    }

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
