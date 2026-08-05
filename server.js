const express = require("express");
const cors = require("cors");
const path = require("path");
const Stripe = require("stripe");
const fs = require('fs');
require("dotenv").config();

// Initialize WhatsApp Bot in background
require('./whatsapp-bot.js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
app.use(cors());

// Webhook Stripe
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = Stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) { return res.status(400).send("Error: " + err.message); }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const email = session.customer_details.email;
        const whatsapp = session.metadata.whatsapp;
        const planId = session.metadata.planId;
        saveOrder({ type: `PAIEMENT: ${planId}`, email, whatsapp });
        if (global.sendWANotif) {
            global.sendWANotif(`💰 *Nouveau Paiement*\n📦 Plan: ${planId}\n📧 Email: ${email}\n📱 WhatsApp: ${whatsapp}`);
        }
    }
    res.send("ok");
});

app.use(express.json());

const PLANS = {
    "1mois": { priceId: process.env.STRIPE_PRICE_1MOIS },
    "3mois": { priceId: process.env.STRIPE_PRICE_3MOIS },
    "6mois": { priceId: process.env.STRIPE_PRICE_6MOIS },
    "12mois": { priceId: process.env.STRIPE_PRICE_12MOIS },
};

const DATA_FILE = 'orders.json';
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

function saveOrder(order) {
    let orders = [];
    try {
        orders = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch(e) {}
    orders.unshift({ date: new Date().toLocaleString(), ...order });
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders.slice(0, 100)));
}

app.get("/admin-check-orders-secret-99", (req, res) => {
    let orders = [];
    try { orders = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
    const pairingCode = global.waPairingCode || "En attente...";
    const waStatus = global.waStatus || "Initialisation...";
    
    let html = `
    <html>
    <head>
        <title>Admin Neo4k</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
            .card { background: #1e293b; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #334155; }
            .status { color: #22c55e; font-weight: bold; }
            .code { font-size: 32px; color: #38bdf8; font-family: monospace; letter-spacing: 5px; background: #000; padding: 10px; display: inline-block; border-radius: 5px; margin: 10px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; border: 1px solid #334155; text-align: left; }
            th { background: #334155; }
            .btn { background: #38bdf8; color: #000; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; font-weight: bold; }
            .btn-wa { background: #22c55e; color: #fff; padding: 5px 10px; border-radius: 5px; text-decoration: none; font-size: 12px; }
            .refresh-btn { background: #f59e0b; color: #fff; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px; font-weight: bold; }
        </style>
        <script>
            function refreshPairing() {
                fetch('/refresh-whatsapp').then(() => {
                    alert('Demande de nouveau code envoyée. Veuillez rafraîchir la page dans 10 secondes.');
                    setTimeout(() => location.reload(), 10000);
                });
            }
        </script>
    </head>
    <body>
        <h1>Tableau de Bord Neo4k Pro</h1>
        
        <div class="card">
            <h2>Statut WhatsApp</h2>
            <p>État: <span class="status">${waStatus}</span></p>
            ${waStatus !== "Connecté ✅" ? `
                <p>Code de couplage (Pairing Code):</p>
                <div class="code">${pairingCode}</div>
                <p><small>Entrez ce code sur votre téléphone (Appareils connectés > Lier un appareil > Lier avec le numéro de téléphone).</small></p>
                <button class="refresh-btn" onclick="refreshPairing()">Générer un nouveau code 🔄</button>
            ` : '<p style="color: #22c55e;">Connecté avec succès!</p>'}
        </div>

        <div class="card">
            <h2>Dernières Commandes et Tests</h2>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Email / WhatsApp</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders.map(o => `
                        <tr>
                            <td>${o.date}</td>
                            <td>${o.type}</td>
                            <td>${o.email}<br><small>${o.whatsapp || 'N/A'}</small></td>
                            <td>
                                ${o.whatsapp ? `<a href="https://wa.me/${o.whatsapp.replace(/\D/g, '')}" class="btn-wa" target="_blank">WhatsApp 💬</a>` : '-'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.get("/refresh-whatsapp", async (req, res) => {
    if (global.requestNewPairingCode) {
        await global.requestNewPairingCode();
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "WhatsApp bot not initialized" });
    }
});

app.post("/request-test", (req, res) => {
    const { email, whatsapp } = req.body;
    if (!email || !whatsapp) return res.status(400).json({ error: "Email et WhatsApp requis" });
    saveOrder({ type: "TEST 24H", email, whatsapp });
    if (global.sendWANotif) {
        global.sendWANotif(`🧪 *Nouvelle Demande de Test*\n📧 Email: ${email}\n📱 WhatsApp: ${whatsapp}`);
    }
    res.json({ success: true });
});

app.post("/create-checkout-session", async (req, res) => {
    const { planId, email, whatsapp } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Plan invalide" });

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: plan.priceId, quantity: 1 }],
            mode: "subscription",
            customer_email: email,
            success_url: "https://neo4k-site-v2.onrender.com/success.html",
            cancel_url: "https://neo4k-site-v2.onrender.com/",
            metadata: { planId, whatsapp }
        });
        res.json({ id: session.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
