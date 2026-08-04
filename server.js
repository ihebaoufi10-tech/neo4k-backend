// ============================================================
// NEO 4K PRO — Backend Stripe
// Paiement -> génération d'un code d'activation -> envoi email
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const app = express();

// ------------------------------------------------------------
// Config des offres : associe un identifiant de plan interne
// au Price ID Stripe correspondant (créé dans le Dashboard Stripe
// > Produits > votre produit > Prix). Et à sa durée en jours,
// utilisée pour la date d'expiration du code.
// ------------------------------------------------------------
const PLANS = {
  '1mois':  { priceId: process.env.STRIPE_PRICE_1MOIS,  label: '1 mois',  durationDays: 30 },
  '3mois':  { priceId: process.env.STRIPE_PRICE_3MOIS,  label: '3 mois',  durationDays: 91 },
  '6mois':  { priceId: process.env.STRIPE_PRICE_6MOIS,  label: '6 mois',  durationDays: 182 },
  '12mois': { priceId: process.env.STRIPE_PRICE_12MOIS, label: '12 mois', durationDays: 365 },
};

const CODES_FILE = path.join(__dirname, 'codes.json');
if (!fs.existsSync(CODES_FILE)) fs.writeFileSync(CODES_FILE, '[]');

function readCodes() {
  return JSON.parse(fs.readFileSync(CODES_FILE, 'utf-8'));
}
function saveCode(entry) {
  const codes = readCodes();
  codes.push(entry);
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2));
}

// Génère un code lisible du type NEO4K-8F2A-91DC-77KM
function generateActivationCode() {
  const block = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `NEO4K-${block()}-${block()}-${block()}`;
}

// ------------------------------------------------------------
// Envoi d'email via l'API HTTPS de SendGrid (port 443).
// IMPORTANT : Render bloque les ports SMTP (25/465/587) sur son
// offre gratuite depuis septembre 2025. L'API HTTPS de SendGrid
// contourne ce blocage puisqu'elle passe par le port 443, comme
// n'importe quelle requête web classique.
// ------------------------------------------------------------
async function sendActivationEmail(toEmail, code, planLabel, expiresAt) {
  const expiresStr = new Date(expiresAt).toLocaleDateString('fr-FR');
  await sgMail.send({
    to: toEmail,
    from: process.env.FROM_EMAIL,
    subject: 'Votre code d\'activation Neo 4K Pro',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#111;">Merci pour votre abonnement 🎬</h2>
        <p>Votre formule : <b>${planLabel}</b></p>
        <p>Voici votre code d'activation :</p>
        <p style="font-size:22px;font-weight:bold;background:#f4f4f4;padding:14px;border-radius:8px;text-align:center;letter-spacing:1px;">
          ${code}
        </p>
        <p>Valable jusqu'au <b>${expiresStr}</b>.</p>
        <p>Entrez ce code dans l'application Neo 4K Pro, dans le menu « Activer un code ».</p>
        <p style="color:#888;font-size:12px;margin-top:24px;">
          Besoin d'aide ? Répondez simplement à cet email.
        </p>
      </div>
    `,
  });
}

// ------------------------------------------------------------
// IMPORTANT : la route webhook doit lire le corps BRUT (raw)
// pour que Stripe puisse vérifier la signature. Elle doit donc
// être déclarée AVANT express.json() global, avec son propre
// middleware express.raw().
// ------------------------------------------------------------
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Signature webhook invalide :', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_details?.email;
      const planId = session.metadata?.planId;
      const plan = PLANS[planId];

      if (!email || !plan) {
        console.error('Session sans email ou plan reconnu :', session.id);
        return res.status(200).send('ok'); // on répond quand même 200 à Stripe
      }

      try {
        const code = generateActivationCode();
        const createdAt = Date.now();
        const expiresAt = createdAt + plan.durationDays * 24 * 60 * 60 * 1000;

        saveCode({
          code,
          email,
          planId,
          planLabel: plan.label,
          sessionId: session.id,
          createdAt,
          expiresAt,
        });

        await sendActivationEmail(email, code, plan.label, expiresAt);
        console.log(`Code envoyé à ${email} : ${code}`);
      } catch (err) {
        console.error('Erreur génération/envoi du code :', err?.response?.body || err);
        // Le paiement reste valide côté Stripe ; à traiter manuellement si besoin.
      }
    }

    res.status(200).send('ok');
  }
);

// Le reste des routes utilise express.json() normalement
app.use(cors());
app.use(express.json());

// ------------------------------------------------------------
// Crée une session de paiement Stripe pour un plan donné et
// renvoie l'URL vers laquelle rediriger le client.
// Appelée depuis les boutons de la page de tarifs.
// ------------------------------------------------------------
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = PLANS[planId];

    if (!plan || !plan.priceId) {
      return res.status(400).json({ error: 'Plan invalide ou non configuré.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      customer_creation: 'always',
      metadata: { planId },
      success_url: `${process.env.SITE_URL}/succes.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/annule.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
});

// Petite route de santé, utile pour vérifier que le serveur tourne
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`Serveur Neo 4K Pro backend lancé sur le port ${PORT}`);
});
