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

// Webhook Stripe (must be before express.json)
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
    const pairingCode = fs.existsSync('pairing-code.txt') ? fs.readFileSync('pairing-code.txt', 'utf8') : "En attente...";
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
            .code { font-size: 32px; color: #38bdf8; font-family: monospace; letter-spacing: 5px; background: #000; padding: 10px; display: inline-block; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; border: 1px solid #334155; text-align: left; }
            th { background: #334155; }
            .btn-wa { background: #25d366; color: white; padding: 5px 10px; border-radius: 5px; text-decoration: none; font-size: 12px; }
        </style>
        <script>setTimeout(() => location.reload(), 15000);</script>
    </head>
    <body>
        <h2>Tableau de Bord Neo4k Pro</h2>
        
        <div class="card">
            <h3>Statut WhatsApp: <span class="status">${waStatus}</span></h3>
            ${waStatus !== "Connecté ✅" ? `
                <p>Entrez ce code sur votre téléphone :</p>
                <div class="code">${pairingCode}</div>
                <p style="font-size: 12px; color: #94a3b8;">(WhatsApp > Appareils liés > Lier un appareil > Lier avec le numéro de téléphone)</p>
            ` : "<p>WhatsApp est prêt pour les notifications !</p>"}
        </div>

        <div class="card">
            <h3>Dernières Commandes et Tests</h3>
            <table>
                <tr><th>Date</th><th>Type</th><th>WhatsApp</th><th>Email</th></tr>
                ${orders.map(o => `
                    <tr>
                        <td>${o.date}</td>
                        <td>${o.type}</td>
                        <td><a href="https://wa.me/${o.whatsapp.replace(/\\D/g,'')}" class="btn-wa" target="_blank">Message ${o.whatsapp}</a></td>
                        <td>${o.email}</td>
                    </tr>
                `).join('')}
            </table>
        </div>
    </body>
    </html>`;
    res.send(html);
});

app.post("/request-trial", async (req, res) => {
    const { email, whatsapp } = req.body;
    saveOrder({ type: "TEST 24H", email, whatsapp });
    if (global.sendWANotif) {
        global.sendWANotif(`🚀 *Nouveau Test 24H*\n📧 Email: ${email}\n📱 WhatsApp: ${whatsapp}`);
    }
    res.json({ success: true });
});

app.post("/create-checkout-session", async (req, res) => {
    try {
        const { planId, whatsapp } = req.body;
        const plan = PLANS[planId];
        if (!plan) throw new Error("Plan invalide");

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: plan.priceId, quantity: 1 }],
            metadata: { planId, whatsapp },
            success_url: "https://neo4k-site-v2.onrender.com/?success=true",
            cancel_url: "https://neo4k-site-v2.onrender.com/?canceled=true",
        });
        res.json({ url: session.url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
