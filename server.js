require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const Stripe = require('stripe');
const { exec } = require('child_process');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const app = express();

const PLANS = {
  '1mois':  { priceId: process.env.STRIPE_PRICE_1MOIS,  label: '1 mois',  durationDays: 30 },
  '3mois':  { priceId: process.env.STRIPE_PRICE_3MOIS,  label: '3 mois',  durationDays: 91 },
  '6mois':  { priceId: process.env.STRIPE_PRICE_6MOIS,  label: '6 mois',  durationDays: 182 },
  '12mois': { priceId: process.env.STRIPE_PRICE_12MOIS, label: '12 mois', durationDays: 365 },
};

async function runAutomation(customerName, planId) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'automation.js');
    exec(`node "<LaTex>{scriptPath}" "</LaTex>{customerName}" "<LaTex>{planId}"`, (error, stdout, stderr) => {       if (error) {         console.error(`Automation Error:</LaTex>{stderr}`);
        return reject(stderr);
      }
      const match = stdout.match(/RESULT:(.+)/);
      if (match) {
        resolve(JSON.parse(match[1]));
      } else {
        reject('No result found in automation output');
      }
    });
  });
}

async function sendRichActivationEmail(toEmail, details, planLabel) {
  const whatsappNumber = "213564653328";
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=Bonjour, voici mon MAC Address pour l'activation 4K Player : `;

  await sgMail.send({
    to: toEmail,
    from: process.env.FROM_EMAIL,
    subject: 'Vos accès Neo 4K Pro 🎬',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #eee;padding:20px;border-radius:10px;direction:ltr;text-align:left;">
        <div style="text-align:center;">
            <h2 style="color:#e67e22;">Merci pour votre confiance ! 🎬</h2>
            <p>Votre abonnement <b>${planLabel}</b> est maintenant actif.</p>
        </div>
        
        <div style="background:#f9f9f9;padding:15px;border-radius:8px;margin:20px 0;border-left:5px solid #e67e22;">
          <h3 style="margin-top:0;">🔑 Vos identifiants :</h3>
          <p><b>Nom d'utilisateur :</b> <code style="background:#eee;padding:2px 5px;"><LaTex>{details.username}</code></p>           <p><b>Mot de passe :</b> <code style="background:#eee;padding:2px 5px;"></LaTex>{details.password}</code></p>
          <p><b>Serveur / Host :</b> <code><LaTex>{details.domain}</code></p>           <p><b>Lien M3U :</b> <br><small style="word-break:break-all;color:#777;"></LaTex>{details.m3u}</small></p>
        </div>

        <h3>📲 Installation par appareil :</h3>
        
        <div style="margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:5px;">
            <b>🤖 Android (Box, TV, Mobile) :</b><br>
            Utilisez Downloader avec le code : <b style="color:#e67e22;">1842729</b> (Neo4K Pro)<br>
            Lien direct : <a href="http://aftv.news/1842729">http://aftv.news/1842729</a>
        </div>

        <div style="margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:5px;">
            <b>📺 Smart TV (Samsung / LG) :</b><br>
            1. Installez <b>Smarters Player Lite</b> et utilisez vos identifiants ci-dessus.<br>
            2. <b>OU</b> utilisez <b>4K Player</b>. Pour l'activer, envoyذ-nous votre <b>MAC Address</b> sur WhatsApp.
        </div>

        <div style="margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:5px;">
            <b>🍎 Apple (iPhone, iPad, Apple TV) :</b><br>
            Installez <b>IPTV Smarters Player</b> depuis l'App Store.
        </div>

        <div style="text-align:center; margin-top:30px;">
            <a href="${whatsappLink}" style="background:#25D366; color:white; padding:12px 25px; text-decoration:none; border-radius:50px; font-weight:bold; display:inline-block;">
                💬 Contact Support (WhatsApp)
            </a>
            <p style="font-size:12px; color:#777; margin-top:10px;">Cliquez ici pour nous envoyer votre MAC Address ou pour toute assistance.</p>
        </div>

        <p style="margin-top:30px;font-size:14px;color:#777;text-align:center;">
          Profitez bien de votre abonnement ! 🍿
        </p>
      </div>
    `,
  });
}

app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email;
      const customerName = (session.customer_details?.name || email.split('@')[0]).replace(/\s+/g, '_').toLowerCase();
      const planId = session.metadata?.planId;
      const plan = PLANS[planId];

      if (email && plan) {
        try {
          const details = await runAutomation(customerName, planId);
          await sendRichActivationEmail(email, details, plan.label);
          console.log(`Success: Account created for <LaTex>{customerName} and email sent to</LaTex>{email}`);
        } catch (err) {
          console.error('Automation/Email Failed:', err);
        }
      }
    }
    res.status(200).send('ok');
  }
);

app.use(cors());
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Plan invalide' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      customer_creation: 'always',
      metadata: { planId },
      success_url: `<LaTex>{process.env.SITE_URL}/succes.html?session_id={CHECKOUT_SESSION_ID}`,       cancel_url: `</LaTex>{process.env.SITE_URL}/annule.html`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

