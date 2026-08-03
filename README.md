# Neo 4K Pro — Backend de paiement Stripe

Ce petit serveur fait 3 choses automatiquement :
1. Crée un paiement Stripe quand un client clique sur "Choisir ce plan".
2. Une fois le paiement confirmé, génère un **code d'activation unique**.
3. **Envoie le code par email** au client automatiquement.

Aucune carte bancaire ni clé Stripe ne passe jamais entre vos mains ou celles de Claude —
tout se fait directement entre Stripe et votre serveur.

---

## 1. Créer votre compte Stripe

1. Allez sur https://dashboard.stripe.com et créez un compte (ou connectez-vous).
2. Dans **Produits**, créez 4 produits : "Neo 4K Pro — 1 mois", "3 mois", "6 mois", "12 mois",
   avec les prix correspondants : **10 €, 20 €, 30 €, 45 €**.
   Important : pour chaque prix, choisissez **"Ponctuel" (one-time)**, pas "Récurrent" —
   sinon Stripe crée un abonnement qui se renouvelle tout seul, alors qu'ici chaque
   paiement génère un code d'activation à durée fixe.
3. Pour chaque prix créé, copiez son **Price ID** (il commence par `price_...`).
4. Dans **Développeurs > Clés API**, copiez votre **Clé secrète** (`sk_live_...` ou
   `sk_test_...` pour tester d'abord).

## 2. Remplir le fichier `.env`

Copiez `.env.example` en `.env` et remplissez :

```
cp .env.example .env
```

- `STRIPE_SECRET_KEY` → votre clé secrète Stripe
- `STRIPE_PRICE_1MOIS`, `STRIPE_PRICE_6MOIS`, `STRIPE_PRICE_12MOIS` → les 3 Price ID
- `SITE_URL` → l'adresse de votre site une fois en ligne
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` → vos identifiants
  d'envoi d'email (Brevo, SendGrid, OVH, etc. — évitez Gmail en production, il limite
  fortement l'envoi automatique)
- `STRIPE_WEBHOOK_SECRET` → voir étape 4, on le récupère après avoir déployé

## 3. Installer et lancer en local (pour tester)

```
npm install
npm start
```

Le serveur tourne sur `http://localhost:4242`.

## 4. Configurer le webhook Stripe

Le webhook est ce qui prévient votre serveur "le paiement est passé, génère le code".

- **En local**, utilisez l'outil Stripe CLI (`stripe listen --forward-to localhost:4242/webhook`),
  qui vous donnera un `whsec_...` à mettre dans `.env`.
- **En production**, une fois votre serveur déployé (étape 5) :
  1. Dashboard Stripe > **Développeurs > Webhooks > Ajouter un endpoint**
  2. URL : `https://votre-domaine-backend.com/webhook`
  3. Événement à écouter : `checkout.session.completed`
  4. Copiez le **Signing secret** (`whsec_...`) généré et mettez-le dans `.env`

## 5. Déployer le serveur en ligne

Ce serveur doit tourner en continu quelque part (il ne peut pas rester sur votre ordinateur).
Les options les plus simples, avec un plan gratuit ou très bon marché :

- **Render.com** (le plus simple : connectez votre dépôt GitHub, il déploie tout seul)
- **Railway.app**
- Un VPS classique (Hetzner, OVH...) avec `pm2` pour garder le serveur actif

Une fois déployé, notez l'URL publique (ex. `https://neo4k-backend.onrender.com`) et :
- mettez-la dans `SITE_URL` du `.env`
- mettez-la dans `BACKEND_URL` en haut du script, à la fin du fichier de la page de tarifs
  (`neo4k-landing-linked.html`)

## 6. Pages de succès / annulation

Le serveur redirige vers `SITE_URL/succes.html` et `SITE_URL/annule.html` après le paiement.
Créez ces deux petites pages sur votre site (un simple "Merci, vérifiez vos emails !" suffit
pour la première).

## Stockage des codes générés

Les codes sont enregistrés dans `codes.json`, à côté du serveur. C'est volontairement simple
pour démarrer. Si votre volume de ventes grandit, remplacez ce fichier par une vraie base de
données (PostgreSQL, MongoDB...) — je peux vous aider à faire cette migration le moment venu.

## Sécurité — à ne jamais faire

- Ne mettez **jamais** `STRIPE_SECRET_KEY` dans la page HTML (front-end) : elle doit rester
  uniquement dans `.env`, côté serveur.
- Ne partagez le fichier `.env` avec personne.
