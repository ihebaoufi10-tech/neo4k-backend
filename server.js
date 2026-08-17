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
        subject: `\u{1F4B0} VENTE R\u00C9USSIE - Neo4k Pro (${details.plan})`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #38bdf8; border-radius: 10px;">
                <h2 style="color: #38bdf8;">Nouvelle commande confirm\u00E9e !</h2>
                <p><strong>Plan choisi :</strong> ${details.plan}</p>
                <p><strong>Email Client :</strong> ${details.email}</p>
                <p><strong>WhatsApp Client :</strong> ${details.whatsapp || 'Non fourni'}</p>
                <p><strong>R\u00E9f\u00E9rence Stripe :</strong> ${details.ref}</p>
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
            h1 { color: #fbbf24; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #334155; padding: 10px; text-align: left; }
            th { background: #1e293b; color: #fbbf24; }
            tr:nth-child(even) { background: #1e293b; }
            .badge { padding: 3px 8px; border-radius: 4px; font-size: 12px; }
            .badge-payment { background: #10b981; color: white; }
            .badge-trial { background: #3b82f6; color: white; }
        </style>
    </head>
    <body>
        <h1>\u{1F4CA} Admin Dashboard - Neo4k Pro</h1>
        <p>Total commandes: ${orders.length}</p>
        <table>
            <tr><th>Date</th><th>Type</th><th>Plan</th><th>Email</th><th>WhatsApp</th><th>R\u00E9f\u00E9rence</th></tr>
            ${orders.map(o => `<tr>
                <td>${o.date || '-'}</td>
                <td><span class="badge ${o.type === 'PAIEMENT' ? 'badge-payment' : 'badge-trial'}">${o.type || '-'}</span></td>
                <td>${o.plan || '-'}</td>
                <td>${o.email || '-'}</td>
                <td>${o.whatsapp || '-'}</td>
                <td style="font-size:11px">${o.ref || '-'}</td>
            </tr>`).join('')}
        </table>
    </body>
    </html>`;
    res.send(html);
});

// Create Checkout Session
app.post("/create-checkout-session", async (req, res) => {
    const { planId, whatsapp } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Plan invalide" });

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: plan.priceId, quantity: 1 }],
            mode: 'payment',
            success_url: 'https://neo4k-site-v2.onrender.com/succes.html?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://neo4k-site-v2.onrender.com/annule.html',
            metadata: { planId, whatsapp: whatsapp || '' },
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

    // Self-ping every 10 minutes to prevent Render cold start
    setInterval(() => {
        const https = require('https');
        https.get('https://neo4k-final.onrender.com/', (res) => {
            console.log(`[Keep-Alive] Ping OK - Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[Keep-Alive] Ping failed:', err.message);
        });
    }, 10 * 60 * 1000); // Every 10 minutes
});
