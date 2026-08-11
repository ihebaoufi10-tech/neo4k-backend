const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuration Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Configuration SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const PLANS = {
    "1mois": { priceId: process.env.STRIPE_PRICE_1MOIS, name: "Plan 1 Mois" },
    "3mois": { priceId: process.env.STRIPE_PRICE_3MOIS, name: "Plan 3 Mois" },
    "6mois": { priceId: process.env.STRIPE_PRICE_6MOIS, name: "Plan 6 Mois" },
    "12mois": { priceId: process.env.STRIPE_PRICE_12MOIS, name: "Plan 12 Mois" },
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
    const adminEmail = process.env.FROM_EMAIL || 'ihebaoufi10@gmail.com';
    const msg = {
        to: adminEmail,
        from: adminEmail,
        subject: `💰 VENTE RÉUSSIE - Neo4k Pro (${details.plan})`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #38bdf8; border-radius: 10px;">
                <h2 style="color: #38bdf8;">Nouvelle commande confirmée !</h2>
                <p><strong>Plan choisi :</strong> ${details.plan}</p>
                <p><strong>Email Client :</strong> ${details.email}</p>
                <p><strong>WhatsApp Client :</strong> ${details.whatsapp || 'Non fourni'}</p>
                <p><strong>Référence Stripe :</strong> ${details.ref}</p>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="color: #666;">Veuillez livrer l'abonnement manuellement via WhatsApp ou Email.</p>
            </div>
        `,
    };
    try {
        await sgMail.send(msg);
        console.log("Admin notification sent via email");
    } catch (error) {
        console.error("SendGrid Error:", error.message);
    }
}

// CORS Middleware
app.use(cors());

// Stripe Webhook (Must be before express.json())
app.post("/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const details = {
            email: session.customer_details.email,
            whatsapp: session.metadata.whatsapp,
            plan: session.metadata.planId,
            ref: session.id,
            type: 'PAIEMENT'
        };
        saveOrder(details);
        await sendAdminEmail(details);
    }

    res.send({ received: true });
});

// Regular Body Parser
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Neo4k Pro Backend is Live and Healthy.');
});

// Trial Request Logic
app.post("/request-trial", async (req, res) => {
    const { email, whatsapp } = req.body;
    const details = { type: "TEST 24H", email, whatsapp, plan: "Test Gratuit" };
    saveOrder(details);
    await sendAdminEmail(details);
    res.json({ success: true });
});

// Admin Dashboard
app.get("/admin-check-orders-secret-99", (req, res) => {
    let orders = [];
    try { orders = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
    
    let html = `
    <html>
    <head>
        <title>Admin Dashboard - Neo4k Pro</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
            .card { background: #1e293b; padding: 25px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
            h1 { color: #38bdf8; text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 15px; text-align: left; border-bottom: 1px solid #334155; }
            th { color: #38bdf8; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .badge-pay { background: #065f46; color: #34d399; }
            .badge-test { background: #92400e; color: #fbbf24; }
            .btn-wa { background: #25d366; color: white; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>🛡️ Neo4k Pro - Admin Dashboard</h1>
        <div class="card">
            <h3>Historique des Commandes</h3>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Plan</th>
                        <th>Email</th>
                        <th>WhatsApp</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders.map(o => `
                        <tr>
                            <td>${o.date}</td>
                            <td><span class="badge ${o.type === 'PAIEMENT' ? 'badge-pay' : 'badge-test'}">${o.type}</span></td>
                            <td>${o.plan}</td>
                            <td>${o.email}</td>
                            <td>${o.whatsapp || '---'}</td>
                            <td>
                                ${o.whatsapp ? `<a href="https://wa.me/${o.whatsapp.replace(/\D/g,'')}" class="btn-wa" target="_blank">WhatsApp</a>` : '---'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </body>
    </html>`;
    res.send(html);
});

// Create Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    const { planId, whatsapp } = req.body;
    const plan = PLANS[planId];
    
    if (!plan || !plan.priceId) {
        return res.status(400).json({ error: "Price ID manquant pour ce plan. Vérifiez Stripe." });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: plan.priceId, quantity: 1 }],
            mode: 'payment',
            success_url: `https://neo4k-site-v2.onrender.com/succes.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: 'https://neo4k-site-v2.onrender.com/annule.html',
            payment_intent_data: {
                description: `Digital Service - ${plan.name}`,
                statement_descriptor: "NEO-SERVICES"
            },
            metadata: { 
                planId: planId,
                whatsapp: whatsapp || 'Non fourni'
            }
        });
        res.json({ url: session.url });
    } catch (e) {
        console.error("Stripe Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});




















































































