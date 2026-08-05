const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const { exec } = require("child_process");
require("dotenv").config();

require('child_process').fork('./whatsapp-bot.js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const ADMIN_WA = "213564653328@s.whatsapp.net";

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET); } catch (err) { return res.status(400).send(err.message); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details.email;
    if (global.sendWA) await global.sendWA(ADMIN_WA, `💰 VENTE !\nClient: <LaTex>{email}\n👉 Activez: https://4k.cms-only.ru/addnew?t=lines`);          exec(`node automation.js "</LaTex>{email.split('@')[0]}" "<LaTex>{session.metadata.planId}" "add" "</LaTex>{email}"`, async (error, stdout) => {
        const match = stdout.match(/RESULT:(.+)/);
        if (match) {
            const d = JSON.parse(match[1]);
            const msg = `✅ ACTIF !\nUser: <LaTex>{d.username}\nPass:</LaTex>{d.password}`;
            if (global.sendWA) await global.sendWA(ADMIN_WA, msg);
        } else {
            if (global.sendWA) await global.sendWA(ADMIN_WA, "⚠️ CAPTCHA ! Activez manuellement pour: " + email);
        }
    });
  }
  res.status(200).send("ok");
});

app.post("/request-trial", express.json(), async (req, res) => {
    if (global.sendWA) await global.sendWA(ADMIN_WA, `🎁 TEST 24H\nEmail: ${req.body.email}\n👉 Activez: https://4k.cms-only.ru/addnew?t=lines`);
    res.json({ success: true });
});

app.use(cors());
app.use(express.json());
app.post("/create-checkout-session", async (req, res) => {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: process.env[`STRIPE_PRICE_${req.body.planId.toUpperCase()}`], quantity: 1 }],
      metadata: { planId: req.body.planId },
      success_url: process.env.SITE_URL + "/succes.html",
      cancel_url: process.env.SITE_URL + "/annule.html",
    });
    res.json({ url: session.url });
});

app.listen(process.env.PORT || 10000);




