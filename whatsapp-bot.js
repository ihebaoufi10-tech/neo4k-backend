const nodeCrypto = require('crypto');
if (!global.crypto) {
    global.crypto = nodeCrypto.webcrypto || nodeCrypto;
}

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require('fs');

global.waStatus = "Initialisation...";
global.waPairingCode = null;

async function connectToWhatsApp() {
    const sessionDir = 'session_final';
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log("Starting WhatsApp Bot...");

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ["Windows", "Chrome", "110.0.0.0"],
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 0,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false
    });

    sock.ev.on('creds.update', saveCreds);

    global.sendWANotif = async (text) => {
        const myNumber = process.env.MY_WHATSAPP_NUMBER || "213564653328";
        try {
            await sock.sendMessage(myNumber.replace(/\D/g, '') + "@s.whatsapp.net", { text });
        } catch (e) {
            console.error("Failed to send WA notification:", e);
        }
    };

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'close') {
            global.waStatus = "Déconnecté ❌";
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : null;
            
            console.log('Connection closed. Status:', statusCode);
            
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(connectToWhatsApp, 10000);
            }
        } else if (connection === 'open') {
            global.waStatus = "Connecté ✅";
            global.waPairingCode = null;
            if (fs.existsSync('pairing-code.txt')) fs.unlinkSync('pairing-code.txt');
            console.log("WhatsApp is Connected!");
        }

        if (!sock.authState.creds.registered && !global.waPairingCode) {
            const phoneNumber = process.env.PHONE_NUMBER || "213564653328";
            try {
                console.log("Requesting Pairing Code for " + phoneNumber);
                await delay(8000);
                const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
                global.waPairingCode = code;
                fs.writeFileSync('pairing-code.txt', code);
                console.log("PAIRING CODE GENERATED: " + code);
            } catch (e) {
                console.error("Pairing Request Error:", e);
                setTimeout(() => { global.waPairingCode = null; }, 30000);
            }
        }
    });
}

connectToWhatsApp().catch(err => console.error("Fatal Bot Error:", err));
