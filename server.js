const express = require('express');
const cors = require('cors');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const Stripe = require('stripe');
const { exec } = require('child_process');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const app = express();

const PLANS = {
  '1mois':  { priceId: process.env.STRIPE_PRICE_1MOIS,  label: '1 mois' },
  '3mois':  { priceId: process.env.STRIPE_PRICE_3MOIS,  label: '3 mois' },
  '6mois':  { priceId: process.env.STRIPE_PRICE_6MOIS,  label: '6 mois' },
  '12mois': { priceId: process.env.STRIPE_PRICE_12MOIS, label: '12 mois' }
};

function runAutomation(customerName, planId) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'automation.js');
    exec('node "' + scriptPath + '" "' + customerName + '" "' + planId + '"', (error, stdout, stderr) => {
      if (error) return reject(stderr);
      const match = stdout.match(/RESULT:(.+)/);
      if (match) resolve(JSON.parse(match[1]));
      else reject('No result');
    });
  });
}

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send('Error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details.email;
    const name = (session.customer_details.name || 'customer').replace(/\s+/g, '_').toLowerCase();
    const planId = session.metadata.planId;
    const plan = PLANS[planId];

    if (email && plan) {
      try {
        const details = await runAutomation(name, planId);
        await sgMail.send({
          to: email,
          from: process.env.FROM_EMAIL,
          subject: 'Accès Neo 4K Pro',
          html: '<h3>Merci!</h3><p>User: ' + details.username + '</p><p>Pass: ' + details.password + '</p>'
        });
      } catch (e) { console.error(e); }
    }
  }
  res.status(200).send('ok');
});

app.use(cors());
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
  try {
    const plan = PLANS[req.body.planId];
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      metadata: { planId: req.body.planId },
      success_url: process.env.SITE_URL + '/succes.html',
      cancel_url: process.env.SITE_URL + '/annule.html',
    });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server Live on ' + PORT));

