const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const fs = require("fs");
const app = express();

app.use(cors());
app.use(express.json());

// Plans configuration
const PLANS = {
    "1mois": { priceId: process.env.STRIPE_PRICE_1MOIS, name: "Plan 1 Mois" },
    "3mois": { priceId: process.env.STRIPE_PRICE_3MOIS, name: "Plan 3 Mois" },
    "6mois": { priceId: process.env.STRIPE_PRICE_6MOIS, name: "Plan 6 Mois" },
    "12mois": { priceId: process.env.STRIPE_PRICE_12MOIS, name: "Plan 12 Mois" },
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

// Admin dashboard
app.get("/admin-check-orders-secret-99", (req, res) => {
    let orders = [];
    try { orders = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
    const pairingCode = global.waPairingCode || "En attente...";
    const waStatus = global.waStatus || "Initialisation...";
    
    let html = `<html><body style="font-family:sans-serif;background:#0f172a;color:#fff;padding:20px;">
    <h1>Admin Neo4k Pro</h1>
    <div style="background:#1e293b;padding:15px;border-radius:10px;margin-bottom:20px;">
        <p>WhatsApp: <b>${waStatus}</b> | Code: <b>${pairingCode}</b></p>
    </div>
    <table border="1" style="width:100%;border-collapse:collapse;">
        <tr><th>Date</th><th>Type</th><th>Email</th></tr>
        ${orders.map(o => `<tr><td>${o.date}</td><td>${o.type}</td><td>${o.email}</td></tr>`).join('')}
    </table>
    </body></html>`;
    res.send(html);
});

// Create Stripe Checkout Session
app.post("/create-checkout-session", async (req, res) => {
    const { planId } = req.body;
    const plan = PLANS[planId];
    
    if (!plan || !plan.priceId) {
        return res.status(400).json({ error: "Plan invalide" });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: plan.priceId, quantity: 1 }],
            mode: "payment",
            // Pass the session ID to the success page to show it as a receipt
            success_url: `https://neo4k-site-v2.onrender.com/succes.html?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
            cancel_url: "https://neo4k-site-v2.onrender.com/annule.html",
            payment_intent_data: {
                description: `Digital Service - ${plan.name}`,
                statement_descriptor: "NEO-SERVICES"
            },
            metadata: { planId: planId }
        });
        
        res.json({ url: session.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Webhook
app.post("/webhook", express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        saveOrder({ type: "PAIEMENT", email: session.customer_details.email, plan: session.metadata.planId });
        if (global.sendWANotif) {
            global.sendWANotif(`💰 *PAIEMENT REÇU*\nPlan: ${session.metadata.planId}\nEmail: ${session.customer_details.email}`);
        }
    }
    res.send("ok");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
