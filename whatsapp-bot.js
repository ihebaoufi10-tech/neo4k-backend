const nodeCrypto = require("crypto");
if (!global.crypto) {
    global.crypto = nodeCrypto.webcrypto || nodeCrypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");

global.waStatus = "Initialisation...";
global.waPairingCode = null;
let sock = null;

// Function to send notification to admin (you)
global.sendWANotif = async (text) => {
    if (sock && global.waStatus === "Connecté ✅") {
        const adminJid = "213564653328@s.whatsapp.net";
        try {
            await sock.sendMessage(adminJid, { text });
        } catch (e) {
            console.error("Error sending WA notification:", e);
        }
    }
};

async function connectToWhatsApp() {
    const sessionDir = 'auth_info_session';
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log("Starting WhatsApp Notification Bot...");

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Windows", "Chrome", "110.0.0.0"],
        connectTimeoutMs: 60000,
        printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    const phoneNumber = "213564653328";
    if (!sock.authState.creds.registered) {
        console.log("Requesting Pairing Code for " + phoneNumber);
        global.waPairingCode = "Génération... ⏳";
        try {
            const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
            global.waPairingCode = code;
            console.log("NEW PAIRING CODE GENERATED: " + code);
        } catch (e) {
            console.error("Pairing Request Error:", e);
            global.waPairingCode = "Erreur ❌";
        }
    } else {
        global.waStatus = "Connecté ✅";
        global.waPairingCode = null;
    }

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            global.waStatus = "Déconnecté ❌";
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : null;
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(connectToWhatsApp, 10000);
            }
        } else if (connection === "open") {
            global.waStatus = "Connecté ✅";
            global.waPairingCode = null;
            console.log("WhatsApp Notification System Active!");
        }
    });

    // We DISABLE message processing to avoid auto-replying and getting banned
    /*
    sock.ev.on("messages.upsert", async (m) => {
        // No auto-reply logic here anymore
    });
    */
}

connectToWhatsApp().catch(err => console.error("Fatal Bot Error:", err));
