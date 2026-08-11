const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const fs = require("fs");
const sgMail = require('@sendgrid/mail');
const app = express();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
app.use(cors());

// Initialize WhatsApp Bot
require('./whatsapp-bot.js');

const DATA_FILE = 'orders.json';
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// --- WEBHOOK STRIPE (المصلح) ---
app.post("/webhook", express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // نستخدم req.body مباشرة كـ Buffer
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log("❌ Webhook Error:", err.message);
        return res.status(400).send("Webhook Error: " + err.message);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const details = {
            email: session.customer_details.email,
            plan: session.metadata.planId || "Neo4k Pro",
            ref: session.id
        };

        // حفظ الطلب
        let orders = [];
        try { orders = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {}
        orders.unshift({ date: new Date().toLocaleString(), ...details });
        fs.writeFileSync(DATA_FILE, JSON.stringify(orders.slice(0, 100)));

        // إرسال إيميل
        const msg = {
            to: "ihebaoufi10@gmail.com",
            from: 'ihebaoufi10@gmail.com',
            subject: '💰 NOUVELLE VENTE - Neo 4K Pro',
            text: `Nouvelle vente! Client: <LaTex>{details.email}, Plan:</LaTex>{details.plan}`,
            html: `<h3>Nouvelle Vente!</h3><p>Client: <LaTex>{details.email}</p><p>Plan:</LaTex>{details.plan}</p>`
        };
        try { await sgMail.send(msg); } catch(e) {}

        // إرسال واتساب
        if (global.sendWANotif) {
            global.sendWANotif(`💰 *NOUVELLE VENTE*\nPlan: <LaTex>{details.plan}\nEmail:</LaTex>{details.email}`);
        }
    }
    res.send({received: true});
});

// باقي المسارات تأتي بعد الويب هوك
app.use(express.json());

app.post("/create-checkout-session", async (req, res) => {
    const { planId } = req.body;
    const PLANS = {
        "1mois": process.env.STRIPE_PRICE_1MOIS,
        "3mois": process.env.STRIPE_PRICE_3MOIS,
        "6mois": process.env.STRIPE_PRICE_6MOIS,
        "12mois": process.env.STRIPE_PRICE_12MOIS
    };
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

app.listen(process.env.PORT || 3000, () => console.log("Server Live!"));

