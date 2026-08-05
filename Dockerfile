FROM node:18

# تثبيت الأدوات اللازمة والمفاتيح لمتصفح جوجل كروم
RUN apt-get update && apt-get install -y wget gnupg ca-certificates --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | tee /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# إنشاء مجلد العمل
WORKDIR /usr/src/app

# تثبيت المكتبات
COPY package*.json ./
RUN npm install

# نسخ ملفات المشروع
COPY . .

# المنفذ
EXPOSE 10000

# تشغيل السيرفر (تأكد أن اسم الملف server.js في GitHub)
CMD [ "node", "server.js" ]


