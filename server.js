const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const fs = require("fs");
const sgMail = require('@sendgrid/mail');
const app = express();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
app.use(cors());

// معالجة البيانات الخام لسترايب
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl === '/webhook') { req.rawBody = buf; }
    }
}));

require('./whatsapp-bot.js');

const DATA_FILE = 'orders.json';
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// رابط الويب هوك
app.post("/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
    } catch (err) { return res.status(400).send("Error"); }
    
    res.json({received: true});

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const details = { email: session.customer_details.email, plan: session.metadata.planId || "Neo4k", ref: session.id };
        
        if (global.sendWANotif) global.sendWANotif("💰 VENTE: " + details.email + " - Plan: " + details.plan);
        
        sgMail.send({
            to: "ihebaoufi10@gmail.com",
            from: "ihebaoufi10@gmail.com",
            subject: "💰 VENTE Neo 4K Pro",
            text: "Nouvelle vente pour: " + details.email
        }).catch(e => console.log("Mail Error"));
    }
});

app.use(express.json());

// رابط الأدمن (سيعمل فوراً)
app.get("/admin", (req, res) => {
    const code = global.waPairingCode || "---";
    const status = global.waStatus || "Initialisation...";
    res.send(`<body style="background:#0f172a;color:white;text-align:center;padding:50px;font-family:sans-serif;">
        <h1>🛡️ Neo4k Admin</h1>
        <div style="background:#1e293b;padding:20px;border-radius:15px;display:inline-block;">
            <h3>Status: <LaTex>{status}</h3>             <h2 style="color:#38bdf8;letter-spacing:5px;background:black;padding:15px;"></LaTex>{code}</h2>
            <button onclick="location.reload()" style="padding:10px 20px;">🔄 Actualiser</button>
            <br><br><a href="/admin-test-email" style="color:#22c55e;">📧 Tester الإيميل</a>
        </div>
    </body>`);
});

app.get("/admin-test-email", async (req, res) => {
    try {
        await sgMail.send({ to: "ihebaoufi10@gmail.com", from: "ihebaoufi10@gmail.com", subject: "Test Email", text: "Si vous voyez ceci, l'email fonctionne !" });
        res.send("✅ Email envoyé ! <a href='/admin'>Retour</a>");
    } catch (e) { res.send("❌ Erreur: " + e.message); }
});

app.post("/create-checkout-session", async (req, res) => {
    const { planId } = req.body;
    const PLANS = { "1mois": process.env.STRIPE_PRICE_1MOIS, "3mois": process.env.STRIPE_PRICE_3MOIS, "6mois": process.env.STRIPE_PRICE_6MOIS, "12mois": process.env.STRIPE_PRICE_12MOIS };
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{ price: PLANS[planId], quantity: 1 }],
            mode: "payment",
            success_url: "https://neo4k-site-v2.onrender.com/succes.html?session_id={CHECKOUT_SESSION_ID}&plan=" + planId,
            cancel_url: "https://neo4k-site-v2.onrender.com/annule.html",
            metadata: { planId: planId }
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000);





