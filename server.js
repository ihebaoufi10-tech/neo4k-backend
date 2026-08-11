const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const fs = require("fs");
const sgMail = require('@sendgrid/mail');
const app = express();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
app.use(cors());

app.use(express.json({
    verify: function(req, res, buf) {
        if (req.originalUrl === '/webhook') { req.rawBody = buf; }
    }
}));

require('./whatsapp-bot.js');

app.post("/webhook", async function(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
    } catch (err) { return res.status(400).send("Error"); }
    
    res.json({received: true});

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const email = session.customer_details.email;
        const plan = session.metadata.planId || "Neo4k";
        
        if (global.sendWANotif) {
            global.sendWANotif("💰 VENTE REUSSIE\nEmail: " + email + "\nPlan: " + plan);
        }
        
        sgMail.send({
            to: "ihebaoufi10@gmail.com",
            from: "ihebaoufi10@gmail.com",
            subject: "💰 VENTE Neo 4K Pro",
            text: "Nouvelle vente: " + email + " (" + plan + ")"
        }).catch(function(e) { console.log("Mail Error"); });
    }
});

app.use(express.json());

app.get("/admin", function(req, res) {
    var code = global.waPairingCode || "---";
    var status = global.waStatus || "Initialisation...";
    
    var html = '<body style="background:#0f172a;color:white;text-align:center;padding:50px;font-family:sans-serif;">';
    html += '<h1>🛡️ Neo4k Admin</h1>';
    html += '<div style="background:#1e293b;padding:20px;border-radius:15px;display:inline-block;min-width:300px;">';
    html += '<h3>Status: <span style="color:#22c55e;">' + status + '</span></h3>';
    html += '<div style="background:black;padding:20px;margin:20px 0;border-radius:10px;border:2px solid #38bdf8;">';
    html += '<h2 style="color:#38bdf8;letter-spacing:5px;font-size:35px;margin:0;">' + code + '</h2>';
    html += '</div>';
    html += '<button onclick="location.reload()" style="padding:10px 20px;cursor:pointer;font-weight:bold;">🔄 Actualiser</button>';
    html += '<br><br><a href="/admin-test-email" style="color:#38bdf8;text-decoration:none;font-weight:bold;">📧 Tester Email</a>';
    html += '</div></body>';
    
    res.send(html);
});

app.get("/admin-test-email", async function(req, res) {
    try {
        await sgMail.send({ to: "ihebaoufi10@gmail.com", from: "ihebaoufi10@gmail.com", subject: "Test Email", text: "L'email fonctionne !" });
        res.send("✅ Email envoyé ! <a href='/admin'>Retour</a>");
    } catch (e) { res.send("❌ Erreur: " + e.message); }
});

app.post("/create-checkout-session", async function(req, res) {
    const planId = req.body.planId;
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






