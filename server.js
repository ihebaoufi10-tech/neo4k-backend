const express = require('express');
const cors = require('cors');
const https = require('https');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuration SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Stripe Configuration
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = {
    "1mois": { name: "Plan 1 Mois", price: 1000, currency: "eur", description: "Service Digital Premium - 1 Mois" },
    "3mois": { name: "Plan 3 Mois", price: 2000, currency: "eur", description: "Service Digital Premium - 3 Mois" },
    "6mois": { name: "Plan 6 Mois", price: 3000, currency: "eur", description: "Service Digital Premium - 6 Mois" },
    "12mois": { name: "Plan 12 Mois", price: 4500, currency: "eur", description: "Service Digital Premium - 12 Mois" },
};

const DATA_FILE = path.join(__dirname, 'orders.json');
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

function saveOrder(order) {
    try {
        const orders = JSON.parse(fs.readFileSync(DATA_FILE));
        orders.unshift({ ...order, date: new Date().toLocaleString() });
        fs.writeFileSync(DATA_FILE, JSON.stringify(orders.slice(0, 100), null, 2));
    } catch (e) {
        console.error("Error saving order:", e);
    }
}

async function sendAdminEmail(details) {
    const adminEmail = 'ihebaoufi10@gmail.com';
    const msg = {
        to: adminEmail,
        from: adminEmail,
        subject: `💰 NOUVELLE COMMANDE - Neo4k Pro (${details.plan})`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #FACC15; border-radius: 10px; background: #111; color: #fff;">
                <h2 style="color: #FACC15;">🛒 Nouvelle commande à traiter !</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; color: #aaa;">Plan :</td><td style="padding: 8px; font-weight: bold; color: #fff;">${details.plan}</td></tr>
                    <tr><td style="padding: 8px; color: #aaa;">Montant :</td><td style="padding: 8px; font-weight: bold; color: #FACC15;">${details.amount || ''}</td></tr>
                    <tr><td style="padding: 8px; color: #aaa;">Email Client :</td><td style="padding: 8px; color: #fff;">${details.email}</td></tr>
                    <tr><td style="padding: 8px; color: #aaa;">Référence :</td><td style="padding: 8px; font-family: monospace; color: #fff;">${details.ref || '-'}</td></tr>
                </table>
                <hr style="border: 0; border-top: 1px solid #333; margin: 15px 0;">
                <p style="color: #888;">Le client a payé via Stripe. Veuillez lui envoyer son code d'accès par Email ou WhatsApp.</p>
            </div>
        `,
    };
    try {
        await sgMail.send(msg);
    } catch (error) {}
}

app.get('/', (req, res) => {
    res.send('Neo4k Pro Backend is Live.');
});

app.post("/create-checkout-session", async (req, res) => {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Plan invalide" });

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: plan.currency,
                    product_data: {
                        name: plan.name,
                        description: plan.description,
                    },
                    unit_amount: plan.price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `https://neo4k-site-v2.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}&plan=${encodeURIComponent(plan.name)}`,
            cancel_url: 'https://neo4k-site-v2.onrender.com/',
            metadata: { plan: plan.name }
        });
        res.json({ id: session.id, url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/stripe-webhook", express.raw({type: 'application/json'}), async (req, res) => {
    let event = req.body;
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const details = {
            type: "PAIEMENT_STRIPE",
            plan: session.metadata.plan,
            amount: `${session.amount_total / 100} EUR`,
            email: session.customer_details.email,
            ref: session.id,
            status: 'COMPLETED',
        };
        saveOrder(details);
        await sendAdminEmail(details);
    }
    res.json({received: true});
});

app.get("/admin-check-orders-secret-99", (req, res) => {
    let orders = [];
    try { orders = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
    let html = `<html><body style="background:#09090b;color:#fff;font-family:sans-serif;padding:20px;">
        <h1 style="color:#FACC15;">📊 Commandes</h1>
        <table border="1" style="width:100%;border-collapse:collapse;border-color:#333;">
            <tr style="background:#18181b;color:#FACC15;"><th>Date</th><th>Plan</th><th>Montant</th><th>Email</th><th>Statut</th></tr>
            ${orders.map(o => `<tr><td>${o.date}</td><td>${o.plan}</td><td>${o.amount}</td><td>${o.email}</td><td>${o.status}</td></tr>`).join('')}
        </table></body></html>`;
    res.send(html);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    setInterval(() => { https.get('https://neo4k-final.onrender.com/', (res) => {}).on('error', (err) => {}); }, 5 * 60 * 1000);
});
