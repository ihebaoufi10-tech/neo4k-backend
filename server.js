const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();

// 1. تفعيل الاتصال بين الموقع والسيرفر (CORS) - مهم جداً
app.use(cors()); 
app.use(express.json());

// تشغيل بوت الواتساب في الخلفية
require('child_process').fork('./whatsapp-bot.js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ADMIN_NUMBER = "213564653328@s.whatsapp.net";

const PLANS = {
  "1mois": { priceId: process.env.STRIPE_PRICE_1MOIS, label: "1 mois" },
  "3mois": { priceId: process.env.STRIPE_PRICE_3MOIS, label: "3 mois" },
  "6mois": { priceId: process.env.STRIPE_PRICE_6MOIS, label: "6 mois" },
  "12mois": { priceId: process.env.STRIPE_PRICE_12MOIS, label: "12 mois" }
};

// صفحة للتأكد من أن السيرفر يعمل
app.get("/", (req, res) => {
  res.send("<h1>Server is Live and Running! 🚀</h1>");
});

// استقبال طلبات التجربة المجانية
app.post("/request-trial", async (req, res) => {
    const { email, name } = req.body;
    console.log("Demande d'essai reçue:", email);
    
    if (global.sendWA) {
        const msg = `🎁 DEMANDE D'ESSAI (24H)\nNom: <LaTex>{name}\nEmail:</LaTex>{email}\n\n👉 Activez le test ici: https://4k.cms-only.ru/addnew?t=lines`;
        await global.sendWA(ADMIN_NUMBER, msg);
        res.json({ success: true });
    } else {
        res.status(500).json({ error: "WhatsApp Bot not ready" });
    }
});

// إنشاء جلسة دفع Stripe
app.post("/create-checkout-session", async (req, res) => {
  try {
    const plan = PLANS[req.body.planId];
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: plan.priceId, quantity: 1 }],
      metadata: { planId: req.body.planId },
      success_url: process.env.SITE_URL + "/succes.html",
      cancel_url: process.env.SITE_URL + "/annule.html",
    });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server Live on " + PORT));





