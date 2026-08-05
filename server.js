const express = require("express");
const cors = require("cors");
const fs = require("fs");
const Stripe = require("stripe");
const path = require("path");
require("dotenv").config();

// Initialiser WhatsApp
const wa = require('./whatsapp-bot');
wa.connectToWhatsApp();

const app = express();
app.use(cors());

const LOG_FILE = path.join(__dirname, "orders_log.json");

const notifyWA = (msg) => {
    if (global.sendWA && global.waStatus && global.waStatus.includes("Connecté")) {
        global.sendWA("213564653328@s.whatsapp.net", msg).catch(e => console.error("WA Notify Error:", e));
    } else {
        console.log("WA Notification (Pending):", msg);
    }
};

function saveOrder(data) {
    let orders = [];
    if (fs.existsSync(LOG_FILE)) {
        try {
            orders = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        } catch (e) { orders = []; }
    }
    orders.unshift({ ...data, date: new Date().toLocaleString('fr-FR') });
    fs.writeFileSync(LOG_FILE, JSON.stringify(orders, null, 2));
}

// Webhook Stripe
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = Stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const whatsapp = session.metadata.whatsapp || "Non fourni";
        saveOrder({ 
            type: "PAIEMENT", 
            email: session.customer_details.email, 
            whatsapp: whatsapp, 
            plan: session.metadata.planId, 
            amount: session.amount_total / 100 
        });
        notifyWA(`💰 COMMANDE RÉUSSIE\nEmail: ${session.customer_details.email}\nWhatsApp: ${whatsapp}\nPlan: ${session.metadata.planId}`);
    }
    res.json({ received: true });
});

app.use(express.json());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Trial Request
app.post("/request-trial", (req, res) => {
    const { email, whatsapp } = req.body;
    if (!email || !whatsapp) return res.status(400).json({ error: "Missing data" });
    
    saveOrder({ type: "TEST 24H", email, whatsapp, plan: "TEST 24H" });
    notifyWA(`🎁 DEMANDE TEST 24H\nEmail: ${email}\nWhatsApp: ${whatsapp}`);
    res.json({ success: true });
});

// Checkout Session
app.post("/create-checkout-session", async (req, res) => {
    const { planId, whatsapp } = req.body;
    const priceKey = `STRIPE_PRICE_${planId.toUpperCase()}`;
    const priceId = process.env[priceKey];

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "payment",
            success_url: "https://neo4k-site-v2.onrender.com/?success=true",
            cancel_url: "https://neo4k-site-v2.onrender.com/?canceled=true",
            metadata: { planId, whatsapp }
        });
        res.json({ id: session.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin Dashboard
app.get("/admin-check-orders-secret-99", (req, res) => {
    let orders = [];
    if (fs.existsSync(LOG_FILE)) {
        try { orders = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch (e) {}
    }

    let html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin - Neo4K Pro</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Unbounded:wght@700&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #0A0D13; --surface: #121828; --border: #242C42; --text: #E9EDF5; --text-dim: #8C97AE; --cyan: #2DD4A7; --orange: #F59E0B; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 1000px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
            h1 { font-family: 'Unbounded'; font-size: 22px; color: var(--cyan); margin: 0; }
            .status-bar { background: var(--surface); border: 1px solid var(--border); padding: 15px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; gap: 20px; }
            .pairing-code { background: #000; color: var(--orange); padding: 5px 15px; border-radius: 6px; font-family: monospace; font-weight: bold; font-size: 18px; border: 1px dashed var(--orange); }
            .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background: rgba(255,255,255,0.03); padding: 15px; font-size: 12px; text-transform: uppercase; color: var(--text-dim); border-bottom: 1px solid var(--border); }
            td { padding: 15px; border-bottom: 1px solid var(--border); font-size: 14px; }
            tr:last-child td { border-bottom: none; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
            .badge-test { background: rgba(245, 158, 11, 0.1); color: #F59E0B; }
            .badge-pay { background: rgba(45, 212, 167, 0.1); color: #2DD4A7; }
            .wa-link { color: var(--cyan); text-decoration: none; display: flex; align-items: center; gap: 5px; }
            .wa-link:hover { text-decoration: underline; }
            @media (max-width: 600px) { th:nth-child(1), td:nth-child(1) { display: none; } }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Neo4K Pro Admin</h1>
                <div style="font-size: 12px; color: var(--text-dim)">Dernière mise à jour: ${new Date().toLocaleTimeString()}</div>
            </div>

            <div class="status-bar">
                <div>Statut WhatsApp: <strong>${global.waStatus || 'Déconnecté'}</strong></div>
                ${global.waPairingCode ? `<div>Code de couplage: <span class="pairing-code">${global.waPairingCode}</span></div>` : ''}
            </div>

            <div class="card">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Client / WhatsApp</th>
                            <th>Plan</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orders.map(o => `
                            <tr>
                                <td style="color: var(--text-dim)">${o.date}</td>
                                <td><span class="badge ${o.type === 'TEST 24H' ? 'badge-test' : 'badge-pay'}">${o.type}</span></td>
                                <td>
                                    <div style="font-weight: 600">${o.email}</div>
                                    <a href="https://wa.me/${o.whatsapp.replace(/\+/g, '')}" target="_blank" class="wa-link">
                                        📱 ${o.whatsapp}
                                    </a>
                                </td>
                                <td><strong>${o.plan}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        <script>setTimeout(() => location.reload(), 30000);</script>
    </body>
    </html>
    `;
    res.send(html);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
