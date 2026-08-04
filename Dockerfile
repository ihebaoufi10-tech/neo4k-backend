FROM ghcr.io/puppeteer/puppeteer:21.0.0

USER root

# تثبيت التبعيات الإضافية إذا لزم الأمر
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# السيرفر يعمل على منفذ 10000
EXPOSE 10000

CMD ["node", "server.js"]
