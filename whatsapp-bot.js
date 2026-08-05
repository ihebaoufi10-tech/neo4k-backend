const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const KNOWLEDGE_BASE = {
    "telecharger": "Pour télécharger l'application Neo 4K Pro, utilisez ce lien : https://bit.ly/neo4k-app. Compatible avec Android, Firestick et Smart TV.",
    "installer": "L'installation est simple : téléchargez l'APK, autorisez les sources inconnues, et ouvrez l'application.",
    "activer": "Entrez l'identifiant et le mot de passe reçus par email ou WhatsApp pour activer votre accès.",
    "prix": "Nos tarifs commencent à 10€/mois. Voir les détails : https://neo4k-site-v2.onrender.com",
    "essai": "Demandez votre test gratuit de 24h sur notre site web !",
    "chaines": "Plus de 16 000 chaînes et 81 000 VOD en 4K/Ultra HD.",
    "smart tv": "Sur Smart TV, utilisez 'IBO PLAYER' ou 'IPTV SMARTERS PRO'.",
    "mag": "Nous supportons les boîtiers MAG. Envoyez-nous votre adresse MAC."
};

async function connectToWhatsApp() {
    const sessionDir = './session_final';
    const zipPath = './session_final.zip';

    if (fs.existsSync(zipPath) && !fs.existsSync(sessionDir)) {
        try { const zip = new AdmZip(zipPath); zip.extractAllTo(sessionDir, true); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ["Neo4k Assistant", "Chrome", "110.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') { console.log('✅ WHATSAPP ONLINE'); }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const from = msg.key.remoteJid;

        for (let key in KNOWLEDGE_BASE) {
            if (text.includes(key)) {
                await sock.sendMessage(from, { text: KNOWLEDGE_BASE[key] });
                return;
            }
        }
        if (text.length > 3) {
            await sock.sendMessage(from, { text: "Bonjour ! Je suis l'assistant Neo 4K Pro. Comment puis-je vous aider ?\n\nPosez-moi vos questions sur : téléchargement, installation, prix, ou essai." });
        }
    });

    global.sendWA = async (jid, text) => {
        try { await sock.sendMessage(jid, { text }); } catch (e) {}
    };
}
connectToWhatsApp().catch(err => console.log(err));











