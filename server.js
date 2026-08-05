const express = require("express");
const cors = require("cors");
const fs = require("fs");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const LOG_FILE = "./orders_log.json";

// وظيفة لحفظ الطلبات في ملف
function saveOrder(data) {
    let orders = [];
    if (fs.existsSync(LOG_FILE)) {
        orders = JSON.parse(fs.readFileSync(LOG_FILE));
    }
    orders.unshift({ ...data, date: new Date().toLocaleString('fr-FR') });
    fs.writeFileSync(LOG_FILE, JSON.stringify(orders, null, 2));
}

// --- الرابط السري الخاص بك لمراقبة الطلبات ---
app.get("/admin-check-orders-secret-99", (req, res) => {
    if (!fs.existsSync(LOG_FILE)) return res.send("<h1>Aucune commande pour le moment.</h1>");
    const orders = JSON.parse(fs.readFileSync(LOG_FILE));
    let html = "<h1>Liste des Commandes et Tests</h1><table border='1'><tr><th>Date</th><th>Type</th><th>Email</th></tr>";
    orders.forEach(o => {
        html += `<tr><td><LaTex>{o.date}</td><td></LaTex>{o.type}</td><td>${o.email}</td></tr>`;
    });
    html += "</table>";
    res.send(html);
});

app.post("/request-trial", (req, res) => {
    const { email } = req.body;
    saveOrder({ type: "TEST 24H", email: email });
    // محاولة إرسال واتساب إذا كان متاحاً
    if (global.sendWA) global.sendWA("213564653328@s.whatsapp.net", "🎁 TEST: " + email).catch(()=>{});
    res.json({ success: true });
});

app.get("/", (req, res) => res.send("Neo4K Backend Live - Admin path ready"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server Live on " + PORT));







