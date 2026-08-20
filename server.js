const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sgMail = require('@sendgrid/mail');
const fs = require('fs');
const path = require('path');

const app = express();

// Configuration SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// PayPal Configuration
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const PLANS = {
    "1mois": { name: "Plan 1 Mois", price: { value: "10.00", currency_code: "EUR" }, description: "Abonnement Neo4K Pro - 1 Mois" },
    "3mois": { name: "Plan 3 Mois", price: { value: "20.00", currency_code: "EUR" }, description: "Abonnement Neo4K Pro - 3 Mois" },
    "6mois": { name: "Plan 6 Mois", price: { value: "30.00", currency_code: "EUR" }, description: "Abonnement Neo4K Pro - 6 Mois" },
    "12mois": { name: "Plan 12 Mois", price: { value: "45.00", currency_code: "EUR" }, description: "Abonnement Neo4K Pro - 12 Mois" },
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
    const source = details.ref ? (details.ref.startsWith('PAYID') ? 'PayPal' : 'Stripe') : 'N/A';
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
                <p><strong>R\u00E9f\u00E9rence ${source} :</strong> ${details.ref}</p>
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

// PayPal: Get Access Token
async function getPayPalToken() {
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    const res = await axios.post(
        `${PAYPAL_BASE_URL}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }
    );
    return res.data.access_token;
}

// PayPal: Create Order
app.post("/create-paypal-order", async (req, res) => {
    const { planId, whatsapp, email } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Plan invalide" });

    try {
        const token = await getPayPalToken();
        const orderRes = await axios.post(
            `${PAYPAL_BASE_URL}/v2/checkout/orders`,
            {
                intent: "CAPTURE",
                purchase_units: [{
                    description: plan.description,
                    amount: {
                        currency_code: plan.price.currency_code,
                        value: plan.price.value,
                    },
                    custom_id: planId,
                }],
                application_context: {
                    brand_name: "Neo4K Pro",
                    user_action: "PAY_NOW",
                    return_url: 'https://neo4k-site-v2.onrender.com/succes.html?plan=' + planId,
                    cancel_url: 'https://neo4k-site-v2.onrender.com/annule.html',
                },
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Save pending order
        const order = orderRes.data;
        saveOrder({
            type: "PAIEMENT",
            plan: plan.name,
            email: email || '',
            whatsapp: whatsapp || '',
            ref: order.id,
            status: 'PENDING'
        });

        res.json({ id: order.id });
    } catch (e) {
        console.error("PayPal Create Order Error:", e.response?.data || e.message);
        res.status(500).json({ error: "Erreur PayPal" });
    }
});

// PayPal: Capture Order
app.post("/capture-paypal-order/:orderID", async (req, res) => {
    const { orderID } = req.params;

    try {
        const token = await getPayPalToken();
        const captureRes = await axios.post(
            `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const order = captureRes.data;
        if (order.status === 'COMPLETED') {
            const details = order.purchase_units[0];
            const planId = details.custom_id || '1mois';
            const plan = PLANS[planId] || PLANS['1mois'];
            const payerEmail = order.payer?.email_address || '';

            // Update saved order status
            try {
                const orders = JSON.parse(fs.readFileSync(DATA_FILE));
                const idx = orders.findIndex(o => o.ref === orderID);
                if (idx !== -1) {
                    orders[idx].status = 'COMPLETED';
                    orders[idx].email = payerEmail;
                    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
                }
            } catch (e) {
                console.error("Error updating order:", e);
            }

            // Send admin email notification
            await sendAdminEmail({
                type: 'PAIEMENT',
                plan: plan.name,
                email: payerEmail,
                whatsapp: '',
                ref: orderID,
            });
        }

        res.json(order);
    } catch (e) {
        console.error("PayPal Capture Error:", e.response?.data || e.message);
        res.status(500).json({ error: "Erreur capture PayPal" });
    }
});

// CORS Middleware
app.use(cors());

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
            .badge-completed { background: #22c55e; color: white; }
            .badge-pending { background: #f59e0b; color: black; }
        </style>
    </head>
    <body>
        <h1>\u{1F4CA} Admin Dashboard - Neo4k Pro</h1>
        <p>Total commandes: ${orders.length}</p>
        <table>
            <tr><th>Date</th><th>Type</th><th>Plan</th><th>Email</th><th>WhatsApp</th><th>Statut</th><th>R\u00E9f\u00E9rence</th></tr>
            ${orders.map(o => `<tr>
                <td>${o.date || '-'}</td>
                <td><span class="badge ${o.type === 'PAIEMENT' ? 'badge-payment' : 'badge-trial'}">${o.type || '-'}</span></td>
                <td>${o.plan || '-'}</td>
                <td>${o.email || '-'}</td>
                <td>${o.whatsapp || '-'}</td>
                <td><span class="badge ${o.status === 'COMPLETED' ? 'badge-completed' : 'badge-pending'}">${o.status || '-'}</span></td>
                <td style="font-size:11px">${o.ref || '-'}</td>
            </tr>`).join('')}
        </table>
    </body>
    </html>`;
    res.send(html);
});

// Get plans info (used by frontend)
app.get("/plans", (req, res) => {
    res.json(PLANS);
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
