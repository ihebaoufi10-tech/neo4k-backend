const express = require("express");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const cors = require("cors");

const fs = require("fs");

const sgMail = require('@sendgrid/mail');

const app = express();



// إعداد SendGrid

sgMail.setApiKey(process.env.SENDGRID_API_KEY);



app.use(cors());



// معالجة البيانات الخام للويب هوك - مهم جداً لسترايب

app.use(express.json({
    
    verify: (req, res, buf) => {
        
        if (req.originalUrl === '/webhook') {
            
            req.rawBody = buf;
            
        }
        
    }
        
}));



// WhatsApp remains disabled by default. Enable only if explicitly configured in Render.

global.waStatus = "Désactivé (livraison manuelle)";

global.waPairingCode = null;

if (process.env.ENABLE_WHATSAPP_BOT === "true") {
    
    require('./whatsapp-bot.js');
    
}



const DATA_FILE = 'orders.json';

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));



function getOrders() {
    
    try {
        
        return JSON.parse(fs.readFileSync(DATA_FILE));
        
    } catch (e) { return []; }
    
}



function saveOrder(order) {
    
    const orders = getOrders();
    
    orders.unshift({ ...order, date: new Date().toLocaleString() });
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders.slice(0, 50)));
    
}



// دالة إرسال الإيميل

async function sendAdminEmail(details) {
    
    const msg = {
        
        to: 'ihebaoufi10@gmail.com',
        
        from: 'ihebaoufi10@gmail.com',
        
        subject: '💰 NOUVELLE VENTE - Neo 4K Pro',
        
        html: `
        
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
            
                <h2 style="color: #22c55e;">Félicitations ! Une nouvelle vente.</h2>
                
                <p><strong>Email Client:</strong> ${details.email}</p>
                
                <p><strong>Plan:</strong> ${details.plan}</p>
                
                <p><strong>Référence Stripe:</strong> ${details.ref}</p>
                
                <hr>
                
                <p>Connectez-vous à votre dashboard pour envoyer le code au client.</p>
                
            </div>
            
        `,
        
    };
    
    try {
        
        await sgMail.send(msg);
        
        console.log("Email envoyé avec succès");
        
        return true;
        
    } catch (error) {
        
        console.error("Erreur SendGrid:", error);
        
        return false;
        
    }
    
}



// رابط الويب هوك لسترايب

app.post("/webhook", async (req, res) => {
    
    const sig = req.headers['stripe-signature'];
    
    let event;
    

    
    try {
        
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
        
    } catch (err) {
        
        console.error(`❌ Webhook Error: ${err.message}`);
        
        return res.status(400).send(`Webhook Error: ${err.message}`);
        
    }
    

    
    res.json({ received: true });
    

    
    if (event.type === 'checkout.session.completed') {
        
        const session = event.data.object;
        
        const details = {
            
            email: session.customer_details.email,
            
            plan: session.metadata.planId || "Neo4k Pro",
            
            ref: session.id
                
        };
        

        
        saveOrder(details);
        

        
        if (global.sendWANotif) {
            
            global.sendWANotif(`💰 *NOUVELLE VENTE*\n\n👤 Client: ${details.email}\n📦 Plan: ${details.plan}\n🆔 Ref: ${details.ref}`);
            
        }
        

        
        await sendAdminEmail(details);
        
    }
    
});



app.use(express.json());



// --- لوحة التحكم ---

const adminHandler = (req, res) => {
    
    const pairingCode = global.waPairingCode || "---";
    
    const waStatus = global.waStatus || "Initialisation...";
    
    const orders = getOrders();
    

    
    const html = `
    
    <!DOCTYPE html>
    
    <html>
    
    <head>
    
        <title>Admin Neo4k</title>
        
        <meta name="viewport" content="width=device-width, initial-scale=1">
        
        <style>
        
            body { font-family: sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
            
            .card { background: #1e293b; padding: 25px; border-radius: 15px; margin-bottom: 20px; border: 1px solid #334155; }
            
            .status-badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-weight: bold; background: #334155; }
            
            .code-box { font-size: 32px; color: #38bdf8; font-family: monospace; letter-spacing: 5px; background: #000; padding: 15px; display: block; text-align: center; border-radius: 10px; margin: 20px 0; border: 2px solid #38bdf8; }
            
            table




















































































