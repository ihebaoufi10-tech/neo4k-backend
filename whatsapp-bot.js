const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');

async function connectToWhatsApp() {
    // مسح الجلسة القديمة العالقة
    if (fs.existsSync('./session_final')) {
        fs.rmSync('./session_final', { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState('./session_final');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // سنستخدم كود الهاتف بدلاً من QR
        logger: pino({ level: 'silent' }),
        browser: ["Neo4k Admin", "Chrome", "110.0.0"]
    });

    // طلب كود الربط بالهاتف (Pairing Code)
    // استبدل الرقم أدناه برقمك مع مفتاح الدولة (مثلاً 213XXXXXXXXX)
    setTimeout(async () => {
        let code = await sock.requestPairingCode("213564653328"); 
        console.log("--------------------------------------");
        console.log("VOTRE CODE DE CONNEXION WHATSAPP IS:", code);
        console.log("--------------------------------------");
    }, 5000);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') console.log('✅ WHATSAPP CONNECTÉ !');
        if (connection === 'close') connectToWhatsApp();
    });

    global.sendWA = async (jid, text) => {
        await sock.sendMessage(jid, { text });
    };
}
connectToWhatsApp();












