const express = require("express");
const cors = require("cors");
const fs = require("fs");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();
app.use(cors());

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
        saveOrder({
            type: "PAIEMENT RÉUSSI",
            email: session.customer_details.email,
            plan: session.metadata.planId,
            amount: session.amount_total / 100
        });
        if (global.sendWA) {
            global.sendWA("213564653328@s.whatsapp.net", `💰 NOUVELLE COMMANDE !\nEmail: ${session.customer_details.email}\nPlan: ${session.metadata.planId}`).catch(()=>{});
        }
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
    if (!fs.existsSync(LOG_FILE)) return res.send("<h1>Aucune commande pour le moment.</h1>");
    let orders = [];
    try { orders = JSON.parse(fs.readFileSync(LOG_FILE)); } catch (e) { return res.send("<h1>Erreur</h1>"); }
    let html = "<h1>Liste des Commandes et Tests</h1><table border='1'><tr><th>Date</th><th>Type</th><th>Email / Détails</th></tr>";
    orders.forEach(o => {
        const details = o.plan ? `${o.email} (Plan: ${o.plan})` : o.email;
        html += `<tr><td>${o.date}</td><td>${o.type}</td><td>${details}</td></tr>`;
    });
    html += "</table>";
    res.send(html);
});

app.post("/create-checkout-session", async (req, res) => {
    try {
        const { planId } = req.body;
        const plan = PLANS[planId];
        if (!plan || !plan.priceId) throw new Error("Plan invalide");
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: plan.priceId, quantity: 1 }],
            metadata: { planId: planId },
            success_url: process.env.SITE_URL + "/succes.html",
            cancel_url: process.env.SITE_URL + "/annule.html",
        });
        res.json({ url: session.url });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/request-trial", (req, res) => {
    const { email } = req.body;
    saveOrder({ type: "TEST 24H", email: email });
    if (global.sendWA) global.sendWA("213564653328@s.whatsapp.net", "🎁 TEST: " + email).catch(()=>{});
    res.json({ success: true });
});

app.get("/", (req, res) => res.send("Neo4K Backend Live"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server Live on " + PORT));
