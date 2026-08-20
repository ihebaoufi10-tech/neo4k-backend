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

// IBAN Payment Configuration
const IBAN = "GB11CLRB04281270826442";
const BANK_NAME = "Trade Republic (NSave)";
const BENEFICIARY = "Iheb Aoufi";
const WHATSAPP_NUMBER = "213564653328";

const PLANS = {
    "1mois": { name: "Plan 1 Mois", price: "10", currency: "EUR", description: "Abonnement Neo4K Pro - 1 Mois" },
    "3mois": { name: "Plan 3 Mois", price: "20", currency: "EUR", description: "Abonnement Neo4K Pro - 3 Mois" },
    "6mois": { name: "Plan 6 Mois", price: "30", currency: "EUR", description: "Abonnement Neo4K Pro - 6 Mois" },
    "12mois": { name: "Plan 12 Mois", price: "45", currency: "EUR", description: "Abonnement Neo4K Pro - 12 Mois" },
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
        subject: `💰 NOUVELLE COMMANDE - Neo4k Pro (${details.plan})`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #FACC15; border-radius: 10px; background: #111;">
                <h2 style="color: #FACC15;">🛒 Nouvelle commande à traiter !</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; color: #aaa;">Plan :</td><td style="padding: 8px; font-weight: bold; color: #fff;">${details.plan}</td></tr>
                    <tr><td style="padding: 8px; color: #aaa;">Montant :</td><td style="padding: 8px; font-weight: bold; color: #FACC15;">${details.amount || ''}</td></tr>
                    <tr><td style="padding: 8px; color: #aaa;">Email Client :</td><td style="padding: 8px; color: #fff;">${details.email}</td></tr>
                    <tr><td style="padding: 8px; color: #aaa;">WhatsApp Client :</td><td style="padding: 8px; color: #fff;">${details.whatsapp || 'Non fourni'}</td></tr>
                    <tr><td style="padding: 8px; color: #aaa;">R\u00E9f\u00E9rence :</td><td style="padding: 8px; font-family: monospace; color: #fff;">${details.ref || '-'}</td></tr>
                </table>
                <hr style="border: 0; border-top: 1px solid #333; margin: 15px 0;">
                <p style="color: #888;">Le client a \u00E9t\u00E9 redirig\u00E9 vers WhatsApp avec les instructions de paiement.<br>Veuillez v\u00E9rifier la r\u00E9ception du virement bancaire puis envoyer le code d'acc\u00E8s.</p>
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

// Health check
app.get('/', (req, res) => {
    res.send('Neo4k Pro Backend is Live and Healthy.');
});

// Create Bank Transfer Order (replaces PayPal)
app.post("/create-bank-order", async (req, res) => {
    const { planId, email, whatsapp } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Plan invalide" });
    if (!email || !email.includes('@')) return res.status(400).json({ error: "Email invalide" });

    // Generate reference
    const ref = `NEO4K-${Date.now().toString(36).toUpperCase()}`;

    // Save order
    saveOrder({
        type: "PAIEMENT",
        plan: plan.name,
        planId: planId,
        amount: `${plan.price} ${plan.currency}`,
        email: email,
        whatsapp: whatsapp || '',
        ref: ref,
        status: 'PENDING',
    });

    // Send admin email
    await sendAdminEmail({
        plan: plan.name,
        amount: `${plan.price} ${plan.currency}`,
        email: email,
        whatsapp: whatsapp || '',
        ref: ref,
    });

    res.json({
        success: true,
        ref: ref,
        iban: IBAN,
        beneficiary: BENEFICIARY,
        bank: BANK_NAME,
        amount: `${plan.price}.${'00'}`,
        currency: plan.currency,
        description: `Neo4K Pro - ${plan.name}`,
        whatsapp: WHATSAPP_NUMBER,
    });
});

// Get IBAN info
app.get("/iban-info", (req, res) => {
    res.json({
        iban: IBAN,
        beneficiary: BENEFICIARY,
        bank: BANK_NAME,
    });
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
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #09090b; color: #e2e8f0; padding: 20px; }
            h1 { color: #FACC15; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #3F3F46; padding: 10px; text-align: left; }
            th { background: #18181b; color: #FACC15; }
            tr:nth-child(even) { background: #18181b; }
            .badge { padding: 3px 8px; border-radius: 4px; font-size: 12px; }
            .badge-payment { background: #10b981; color: white; }
            .badge-trial { background: #3b82f6; color: white; }
            .badge-completed { background: #22c55e; color: white; }
            .badge-pending { background: #f59e0b; color: black; }
            .whatsapp-link { color: #25D366; text-decoration: none; }
        </style>
    </head>
    <body>
        <h1>📊 Admin Dashboard - Neo4k Pro</h1>
        <p>Total commandes: ${orders.length}</p>
        <table>
            <tr><th>Date</th><th>Type</th><th>Plan</th><th>Montant</th><th>Email</th><th>WhatsApp</th><th>Statut</th><th>R\u00E9f\u00E9rence</th></tr>
            ${orders.map(o => `<tr>
                <td>${o.date || '-'}</td>
                <td><span class="badge ${o.type === 'PAIEMENT' ? 'badge-payment' : 'badge-trial'}">${o.type || '-'}</span></td>
                <td>${o.plan || '-'}</td>
                <td style="color: #FACC15;">${o.amount || '-'}</td>
                <td>${o.email || '-'}</td>
                <td><a class="whatsapp-link" href="https://wa.me/${(o.whatsapp || '').replace(/[^0-9]/g, '')}">${o.whatsapp || '-'}</a></td>
                <td><span class="badge ${o.status === 'COMPLETED' ? 'badge-completed' : 'badge-pending'}">${o.status || '-'}</span></td>
                <td style="font-size:11px">${o.ref || '-'}</td>
            </tr>`).join('')}
        </table>
    </body>
    </html>`;
    res.send(html);
});

// Get plans info
app.get("/plans", (req, res) => {
    res.json(PLANS);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Self-ping every 5 minutes to prevent Render cold start
    setInterval(() => {
        https.get('https://neo4k-final.onrender.com/', (res) => {
            console.log(`[Keep-Alive] Ping OK - Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('[Keep-Alive] Ping failed:', err.message);
        });
    }, 5 * 60 * 1000); // Every 5 minutes
});
