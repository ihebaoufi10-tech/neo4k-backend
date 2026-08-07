const express = require("express");
const cors = require("cors");
const path = require("path");
const Stripe = require("stripe");
const fs = require('fs');
require("dotenv").config();

// Initialize WhatsApp Bot for notifications only
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
        const whatsapp = session.metadata.whatsapp || "N/A";
        const planId = session.metadata.planId;
        
        saveOrder({ type: `PAIEMENT: ${planId}`, email, whatsapp });
        
        // Notify admin on WhatsApp
        if (global.sendWANotif) {
            global.sendWANotif(`💰 *NOUVEAU PAIEMENT*\n📦 Service: Streaming Pro\n📦 Plan: ${planId}\n📧 Email: ${email}\n📱 WhatsApp: ${whatsapp}\n\n👉 Le client va vous contacter pour son code.`);
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
            .btn-wa { background: #22c55e; color: #fff; padding: 5px 10px; border-radius: 5px; text-decoration: none; font-size: 12px; }
            .refresh-btn { background: #f59e0b; color: #fff; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>Tableau de Bord Neo4k Pro</h1>
        
        <div class="card">
            <h2>Statut WhatsApp (Notifications Admin)</h2>
            <p>État: <span class="status">${waStatus}</span></p>
            ${waStatus !== "Connecté ✅" ? `
                <p>Code de couplage :</p>
                <div class="code">${pairingCode}</div>
                <button class="refresh-btn" onclick="location.reload()">Rafraîchir 🔄</button>
            ` : '<p style="color: #22c55e;">Connecté ! Vous recevrez les alertes ici.</p>'}
        </div>

        <div class="card">
            <h2>Dernières Commandes</h2>
            <table>
                <thead>
                    <tr><th>Date</th><th>Type</th><th>Email / WhatsApp</th><th>Action</th></tr>
                </thead>
                <tbody>
                    ${orders.map(o => `
                        <tr>
                            <td>${o.date}</td>
                            <td>${o.type}</td>
                            <td>${o.email}<br><small>${o.whatsapp || 'N/A'}</small></td>
                            <td>
                                ${o.whatsapp && o.whatsapp !== 'N/A' ? `<a href="https://wa.me/${o.whatsapp.replace(/\D/g, '')}" class="btn-wa" target="_blank">WhatsApp 💬</a>` : '-'}
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

app.post("/create-checkout-session", async (req, res) => {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Plan invalide" });

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: plan.priceId, quantity: 1 }],
            mode: "payment", // Changed to one-time payment for safety
            success_url: "https://neo4k-site-v2.onrender.com/succes.html",
            cancel_url: "https://neo4k-site-v2.onrender.com/annule.html",
            payment_intent_data: {
                description: "Digital Service - Neo Access",
                statement_descriptor: "NEO-SERVICES" // This is what appears on bank statement
            }
        });
        res.json({ id: session.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
