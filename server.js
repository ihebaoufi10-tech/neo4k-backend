const express = require("express");
const cors = require("cors");
const fs = require("fs");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();
app.use(cors());

// Simulation de l'envoi WhatsApp (global.sendWA est défini dans automation.js)
const notifyWA = (msg) => {
    if (global.sendWA) {
        global.sendWA("213564653328@s.whatsapp.net", msg).catch(e => console.error("WA Error:", e));
    } else {
        console.log("WA Notification (Dry Run):", msg);
    }
};

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
            type: "PAIEMENT RÉUSSI",
            email: session.customer_details.email,
            whatsapp: whatsapp,
            plan: session.metadata.planId,
            amount: session.amount_total / 100
        });
        notifyWA(`💰 NOUVELLE COMMANDE !\nEmail: ${session.customer_details.email}\nWhatsApp: ${whatsapp}\nPlan: ${session.metadata.planId}`);
    }
    res.json({ received: true });
});

app.use(express.json());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const LOG_FILE = "./orders_log.json";

const PLANS = {
    "1mois": { priceId: process.env.STRIPE_PRICE_1MOIS },
    "3mois": { priceId: process.env.STRIPE_PRICE_3MOIS },
    "6mois": { priceId: process.env.STRIPE_PRICE_6MOIS },
    "12mois": { priceId: process.env.STRIPE_PRICE_12MOIS }
};

function saveOrder(data) {
    let orders = [];
    if (fs.existsSync(LOG_FILE)) {
        try { orders = JSON.parse(fs.readFileSync(LOG_FILE)); } catch (e) { orders = []; }
    }
    orders.unshift({ ...data, date: new Date().toLocaleString('fr-FR') });
    fs.writeFileSync(LOG_FILE, JSON.stringify(orders, null, 2));
}

app.get("/admin-check-orders-secret-99", (req, res) => {
    let orders = [];
    if (fs.existsSync(LOG_FILE)) {
        try { orders = JSON.parse(fs.readFileSync(LOG_FILE)); } catch (e) { orders = []; }
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
            :root { --bg: #0A0D13; --surface: #121828; --border: #242C42; --text: #E9EDF5; --text-dim: #8C97AE; --cyan: #2DD4A7; }
            body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; margin: 0; padding: 20px; }
            .container { max-width: 1000px; margin: 0 auto; }
            h1 { font-family: 'Unbounded'; font-size: 24px; color: var(--cyan); margin-bottom: 30px; text-align: center; }
            .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background: rgba(255,255,255,0.05); padding: 15px; font-size: 13px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }
            td { padding: 15px; border-top: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
            tr:hover { background: rgba(45, 212, 167, 0.03); }
            .badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; display: inline-block; }
            .badge-paid { background: rgba(45, 212, 167, 0.1); color: var(--cyan); }
            .badge-test { background: rgba(255, 184, 77, 0.1); color: #FFB84D; }
            .email { font-weight: 600; color: #fff; display: block; }
            .whatsapp { color: var(--cyan); font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; margin-top: 5px; }
            .whatsapp:hover { text-decoration: underline; }
            .date { color: var(--text-dim); font-family: monospace; font-size: 12px; }
            .empty { padding: 40px; text-align: center; color: var(--text-dim); }
            @media (max-width: 768px) {
                th:nth-child(1) { display: none; }
                td:nth-child(1) { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Neo4K Pro - Gestion des Commandes</h1>
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
    `;
    
    if (orders.length === 0) {
        html += '<tr><td colspan="4" class="empty">Aucune commande enregistrée pour le moment.</td></tr>';
    } else {
        orders.forEach(o => {
            const typeClass = o.type.includes('PAIEMENT') ? 'badge-paid' : 'badge-test';
            const waLink = o.whatsapp && o.whatsapp !== 'Non fourni' ? 
                `<a href="https://wa.me/${o.whatsapp.replace(/\D/g,'')}" class="whatsapp" target="_blank">📱 ${o.whatsapp}</a>` : 
                '<span style="color:var(--text-dim)">WhatsApp non fourni</span>';
            
            html += `
                <tr>
                    <td class="date">${o.date}</td>
                    <td><span class="badge ${typeClass}">${o.type}</span></td>
                    <td>
                        <span class="email">${o.email}</span>
                        ${waLink}
                    </td>
                    <td><strong style="color:var(--cyan)">${o.plan || 'TEST 24H'}</strong></td>
                </tr>
            `;
        });
    }
    
    html += `
                    </tbody>
                </table>
            </div>
            <p style="text-align:center; margin-top:30px; color:var(--text-dim); font-size:12px;">Système automatisé Neo4K Pro</p>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.post("/create-checkout-session", async (req, res) => {
    try {
        const { planId, whatsapp } = req.body;
        const plan = PLANS[planId];
        if (!plan || !plan.priceId) throw new Error("Plan invalide");
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: plan.priceId, quantity: 1 }],
            metadata: { planId: planId, whatsapp: whatsapp },
            success_url: process.env.SITE_URL + "/succes.html",
            cancel_url: process.env.SITE_URL + "/annule.html",
        });
        res.json({ url: session.url });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/request-trial", (req, res) => {
    const { email, whatsapp } = req.body;
    saveOrder({ type: "TEST 24H", email: email, whatsapp: whatsapp });
    notifyWA(`🎁 DEMANDE TEST 24H\nEmail: ${email}\nWhatsApp: ${whatsapp}`);
    res.json({ success: true });
});

app.get("/", (req, res) => res.send("Neo4K Backend Live"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server Live on " + PORT));
