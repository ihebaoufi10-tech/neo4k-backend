const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
app.use(cors());
app.use(express.json());

// استخدام المفتاح من متغيرات البيئة فقط للأمان
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
    "1mois": process.env.STRIPE_PRICE_1MOIS || "price_1U32MdFi4Tntcp2QhQNLJKh2",
    "3mois": process.env.STRIPE_PRICE_3MOIS || "price_1U32MYFi4Tntcp2QANlIxgo1",
    "6mois": process.env.STRIPE_PRICE_6MOIS || "price_1U32MaFi4Tntcp2QcnOsxcrR",
    "12mois": process.env.STRIPE_PRICE_12MOIS || "price_1U32MYFi4Tntcp2QFUjq7XBy"
};

app.get('/', (req, res) => {
    res.send('Neo4k Pro Backend Live is running safely.');
});

app.post('/create-checkout-session', async (req, res) => {
    const { planId } = req.body;
    const priceId = PLANS[planId];
    
    if (!priceId) {
        return res.status(400).json({ error: "Plan non valide" });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: 'payment',
            success_url: `https://neo4k-site-v2.onrender.com/succes.html?session_id={CHECKOUT_SESSION_ID}&plan=${planId}`,
            cancel_url: 'https://neo4k-site-v2.onrender.com/annule.html',
            metadata: { planId: planId }
        });
        res.json({ url: session.url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});




















































































