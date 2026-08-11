const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const fs = require('fs');
const sgMail = require('@sendgrid/mail');
const app = express();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
app.use(cors());

app.use(express.json({
    verify: function(req, res, buf) {
        if (req.originalUrl === '/webhook') { req.rawBody = buf; }
    }
}));

const DATA_FILE = 'orders.json';
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

app.post('/webhook', async function(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
    } catch (err) { return res.status(400).send('Error'); }
    
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const details = {
            email: session.customer_details.email,
            plan: session.metadata.planId || 'Inconnu',
            date: new Date().toLocaleString()
        };
        
        let orders = JSON.parse(fs.readFileSync(DATA_FILE));
        orders.push(details);
        fs.writeFileSync(DATA_FILE, JSON.stringify(orders));

        // إرسال الإيميل بطريقة مضمونة 100%
        const msg = {
            to: 'ihebaoufi10@gmail.com',
            from: 'ihebaoufi10@gmail.com',
            subject: '💰 NOUVELLE VENTE - Neo 4K Pro',
            html: '<div style="font-family:sans-serif; padding:20px; border:1px solid #eee;">' +
                  '<h2 style="color:#2ecc71;">Nouvelle vente réussie !</h2>' +
                  '<p><b>Email du client:</b> ' + details.email + '</p>' +
                  '<p><b>Plan choisi:</b> ' + details.plan + '</p>' +
                  '<p><b>Date:</b> ' + details.date + '</p>' +
                  '<hr>' +
                  '<p>Vous pouvez maintenant envoyer le code au client.</p>' +
                  '</div>'
        };
        try { await sgMail.send(msg); } catch (e) { console.error(e); }
    }
    res.json({received: true});
});

app.get('/admin', function(req, res) {
    const orders = JSON.parse(fs.readFileSync(DATA_FILE));
    let rows = '';
    orders.reverse().forEach(function(o) {
        rows += '<tr><td style="border:1px solid #444;padding:10px;">' + o.date + '</td>' +
                '<td style="border:1px solid #444;padding:10px;">' + o.email + '</td>' +
                '<td style="border:1px solid #444;padding:10px;">' + o.plan + '</td></tr>';
    });
    res.send('<body style="background:#0f172a;color:white;font-family:sans-serif;padding:20px;">' +
             '<h1>💰 Liste des Ventes</h1>' +
             '<table style="width:100%;border-collapse:collapse;">' +
             '<tr style="background:#1e293b;"><th>Date</th><th>Email Client</th><th>Plan</th></tr>' +
             rows + '</table><br>' +
             '<a href="/admin-test-email" style="color:#38bdf8;">📧 Tester l\'envoi d\'email</a>' +
             '</body>');
});

app.get('/admin-test-email', async function(req, res) {
    try {
        await sgMail.send({ to: 'ihebaoufi10@gmail.com', from: 'ihebaoufi10@gmail.com', subject: 'Test Email OK', text: 'Le système est prêt !' });
        res.send('✅ Email envoyé ! <a href="/admin">Retour</a>');
    } catch (e) { res.send('❌ Erreur: ' + e.message); }
});

app.post('/create-checkout-session', async function(req, res) {
    const planId = req.body.planId;
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









