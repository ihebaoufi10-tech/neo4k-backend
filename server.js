const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const fs = require('fs');
const sgMail = require('@sendgrid/mail');
const app = express();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
app.use(cors());

// معالجة بيانات Stripe Webhook
app.use(express.json({
    verify: function(req, res, buf) {
        if (req.originalUrl === '/webhook') { req.rawBody = buf; }
    }
}));

const DATA_FILE = 'orders.json';
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

// وظيفة لإرسال إيميل تنبيه لك
async function notifyAdmin(details) {
    const msg = {
        to: 'ihebaoufi10@gmail.com',
        from: 'ihebaoufi10@gmail.com',
        subject: '💰 NOUVELLE VENTE - Neo 4K Pro',
        html: `
            <div style="font-family:sans-serif; border:1px solid #eee; padding:20px;">
                <h2 style="color:#22c55e;">Nouvelle vente réussie !</h2>
                <p><strong>Email du client:</strong> <LaTex>{details.email}</p>                 <p><strong>Plan choisi:</strong></LaTex>{details.plan}</p>
                <p><strong>ID Transaction:</strong> ${details.ref}</p>
                <hr>
                <p>Vous pouvez اآن إرسال الكود للزبون عبر إيميله أو انتظاره ليراسلكم عبر واتساب.</p>
            </div>
        `
    };
    try { await sgMail.send(msg); } catch (e) { console.log("Email Error"); }
}

// رابط الويب هوك (هذا هو المحرك الأساسي)
app.post('/webhook', async function(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
    } catch (err) { return res.status(400).send('Webhook Error'); }
    
    res.json({received: true});

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const details = {
            email: session.customer_details.email,
            plan: session.metadata.planId || 'Abonnement',
            ref: session.id,
            date: new Date().toLocaleString()
        };

        // حفظ الطلب في الملف
        let orders = JSON.parse(fs.readFileSync(DATA_FILE));
        orders.unshift(details);
        fs.writeFileSync(DATA_FILE, JSON.stringify(orders.slice(0, 100)));

        // إرسال الإيميل لك فوراً
        await notifyAdmin(details);
    }
});

app.use(express.json());

// لوحة تحكم بسيطة لرؤية المبيعات
app.get('/admin', function(req, res) {
    let orders = JSON.parse(fs.readFileSync(DATA_FILE));
    let html = '<body style="background:#0f172a;color:white;font-family:sans-serif;padding:20px;">';
    html += '<h1>💰 Liste des Ventes</h1>';
    html += '<table border="1" style="width:100%;border-collapse:collapse;text-align:left;">';
    html += '<tr style="background:#1e293b;"><th>Date</th><th>Email Client</th><th>Plan</th></tr>';
    orders.forEach(o => {
        html += `<tr><td>${o.date}</td><td><LaTex>{o.email}</td><td></LaTex>{o.plan}</td></tr>`;
    });
    html += '</table><br><a href="/admin-test-email" style="color:#38bdf8;">📧 Tester l\'envoi d\'email</a></body>';
    res.send(html);
});

app.get('/admin-test-email', async function(req, res) {
    await notifyAdmin({ email: 'TEST@GMAIL.COM', plan: 'TEST_PLAN', ref: 'TEST_REF' });
    res.send('✅ Email de test envoyé à ihebaoufi10@gmail.com ! <a href="/admin">Retour</a>');
});

app.post('/create-checkout-session', async function(req, res) {
    const { planId } = req.body;
    const PLANS = { '1mois': process.env.STRIPE_PRICE_1MOIS, '3mois': process.env.STRIPE_PRICE_3MOIS, '6mois': process.env.STRIPE_PRICE_6MOIS, '12mois': process.env.STRIPE_PRICE_12MOIS };
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: PLANS[planId], quantity: 1 }],
            mode: 'payment',
            success_url: 'https://neo4k-site-v2.onrender.com/succes.html?session_id={CHECKOUT_SESSION_ID}&plan=' + planId,
            cancel_url: 'https://neo4k-site-v2.onrender.com/annule.html',
            metadata: { planId: planId }
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000);








