const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const fs = require("fs");
const sgMail = require('@sendgrid/mail');
const app = express();

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(cors());

// Initialize WhatsApp Bot
require('./whatsapp-bot.js');

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

// Function to send email notification to admin
async function sendAdminEmail(details) {
    const adminEmail = "ihebaoufi10@gmail.com"; 
    
    const msg = {
        to: adminEmail,
        from: 'ihebaoufi10@gmail.com',
        subject: '💰 NOUVELLE VENTE - Neo 4K Pro',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #22c55e;">Nouvelle Commande Reçue !</h2>
                <p><strong>Client :</strong> ${details.email}</p>
                <p><strong>Plan :</strong> ${details.plan}</p>
                <p><strong>Référence :</strong> ${details.ref}</p>
                <p><strong>Date :</strong> ${new Date().toLocaleString()}</p>
                <hr>
                <p style="font-size: 12px; color: #666;">Vérifiez votre compte Stripe pour confirmer le paiement.</p>
            </div>
        `,
    };
    try {
        await sgMail.send(msg);
        console.log("Admin email notification sent to " + adminEmail);
    } catch (error) {
        console.error("SendGrid Error:", error.response ? error.response.body : error.message);
    }
}

// --- IMPORTANT: STRIPE WEBHOOK MUST BE BEFORE express.json() ---
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
            plan: session.metadata.planId,
            ref: session.id
        };

        saveOrder(details);
        await sendAdminEmail(details);

        if (global.sendWANotif) {
            global.sendWANotif(`💰 *NOUVELLE VENTE*\nPlan: ${details.plan}\nEmail: ${details.email}\nRef: ${details.ref}`);
        }
    }
    res.send("ok");
});
// -------------------------------------------------------------

app.use(express.json());

// Admin dashboard route
app.get("/admin-check-orders-secret-99", (req, res) => {
    let orders = [];
    try { orders = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
    const pairingCode = global.waPairingCode || "---";
    const waStatus = global.waStatus || "Initialisation...";
    
    let html = `
    <html>
    <head>
        <title>Admin Neo4k Pro</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
            .card { background: #1e293b; padding: 25px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #334155; }
            .status-badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-weight: bold; background: #334155; }
            .code-box { font-size: 32px; color: #38bdf8; font-family: monospace; letter-spacing: 5px; background: #000; padding: 15px; display: block; text-align: center; border-radius: 10px; margin: 20px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
            .btn { padding: 10px 20px; border-radius: 8px; cursor: pointer; border: none; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>🛡️ Dashboard Admin</h1>
        <div class="card">
            <h3>WhatsApp Status: <span class="status-badge">${waStatus}</span></h3>
            ${!waStatus.includes('✅') ? `<div class="code-box">${pairingCode}</div>` : ''}
            <button class="btn" style="background:#38bdf8" onclick="location.reload()">🔄 Refresh</button>
            <button class="btn" style="background:#ef4444; color:white" onclick="location.href='/admin-reset-wa'">⚠️ Reset</button>
        </div>
        <div class="card">
            <h3>Dernières Ventes</h3>
            <table>
                <thead><tr><th>Date</th><th>Plan</th><th>Email</th></tr></thead>
                <tbody>
                    ${orders.map(o => `<tr><td>${o.date}</td><td>${o.plan}</td><td>${o.email}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    </body>
    </html>`;
    res.send(html);
});

app.get("/admin-reset-wa", (req, res) => {
    if (global.restartWABot) {
        global.restartWABot();
        res.send("<script>alert('Resetting...'); location.href='/admin-check-orders-secret-99';</script>");
    }
});

// Create Stripe Checkout Session
app.post("/create-checkout-session", async (req, res) => {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan || !plan.priceId) return res.status(400).json({ error: "Plan invalide" });

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: plan.priceId, quantity: 1 }],
            mode: "payment",
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
