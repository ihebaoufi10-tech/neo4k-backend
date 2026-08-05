const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');


global.waStatus = "Initialisation...";
global.waPairingCode = null;


async function connectToWhatsApp() {
    // Cleanup to force new code
    if (fs.existsSync('./session_final')) {
        try { fs.rmSync('./session_final', { recursive: true, force: true }); } catch (e) {}
    }


    const { state, saveCreds } = await useMultiFileAuthState('./session_final');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        // Use a more standard browser string
        browser: ["Ubuntu", "Chrome", "110.0.5481.177"]
    });


    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            global.waStatus = "Connecté ✅";
            global.waPairingCode = null;
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
                // The phone number must be without + but with country code
                let code = await sock.requestPairingCode("213564653328");
                global.waPairingCode = code;
                global.waStatus = "En attente de couplage... 🔑";
            } catch (e) {
                global.waStatus = "Erreur de code ❌";
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


// Restart for fresh pairing code: 1785960950512
