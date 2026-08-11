const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const fs = require("fs");
const sgMail = require('@sendgrid/mail');
const app = express();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
app.use(cors());

// معالجة البيانات الخام للويب هوك (يجب أن تكون قبل أي شيء آخر)
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl === '/webhook') {
            req.rawBody = buf;
        }
    }
}));

// ربط بوت الواتساب
require('./whatsapp-bot.js');

const DATA_FILE = 'orders.json';
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// رابط الويب هوك لسترايب
app.post("/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
    } catch (err) {
        return res.status(400).send("Webhook Error");
    }
    res.json({received: true});

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const details = {
            email: session.customer_details.email,
            plan: session.metadata.planId || "Neo4k Pro",
            ref: session.id
        };
        // إرسال الإشعارات
        if (global.sendWANotif) global.sendWANotif(`💰 *NOUVELLE VENTE*\nPlan: <LaTex>{details.plan}\nEmail:</LaTex>{details.email}`);
        sgMail.send({
            to: "ihebaoufi10@gmail.com",
            from: 'ihebaoufi10@gmail.com',
            subject: '💰 VENTE Neo 4K Pro',
            html: `<p>Vente réussie pour: ${details.email}</p>`
        }).catch(e => console.log("Email error"));
    }
});

app.use(express.json());

// --- رابط الأدمن الجديد والأبسط ---
app.get("/admin", (req, res) => {
    const pairingCode = global.waPairingCode || "---";
    const waStatus = global.waStatus || "Initialisation...";
    res.send(`
        <body style="font-family:sans-serif; background:#0f172a; color:white; text-align:center; padding:50px;">
            <h1>🛡️ Neo4k Admin</h1>
            <div style="background:#1e293b; padding:20px; border-radius:15px; display:inline-block;">
                <h3>Status: ${waStatus}</h3>
                <h2 style="color:#38bdf8; letter-spacing:5px; background:black; padding:15px;">${pairingCode}</h2>
                <button onclick="location.reload()" style="padding:10px 20px; cursor:pointer;">🔄 Actualiser</button>
            </div>
        </body>
    `);
});

app.post("/create-checkout-session", async (req, res) => {
    const { planId } = req.body;
    const PLANS = { "1mois": process.env.STRIPE_PRICE_1MOIS, "3mois": process.env.STRIPE_PRICE_3MOIS, "6mois": process.env.STRIPE_PRICE_6MOIS, "12mois": process.env.STRIPE_PRICE_12MOIS };
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: PLANS[planId], quantity: 1 }],
            mode: "payment",
            success_url: `https://neo4k-site-v2.onrender.com/succes.html?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
            cancel_url: "https://neo4k-site-v2.onrender.com/annule.html",
            metadata: { planId: planId }
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000);




