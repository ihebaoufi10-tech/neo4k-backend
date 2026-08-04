const puppeteer = require('puppeteer');

async function runAutomation(customerName, planId) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    try {
        await page.goto('https://4k.cms-only.ru/login', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#uname');
        await page.type('#uname', 'ihebfrance', { delay: 50 });
        await page.type('#password-input', 'france108', { delay: 50 });
        
        const verifyBtn = await page.$('button.btn-success');
        if (verifyBtn) {
            await verifyBtn.click();
            await new Promise(r => setTimeout(r, 3000));
        }
        
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        await page.goto('https://4k.cms-only.ru/addnew?t=lines', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#mac');
        await page.type('#mac', customerName, { delay: 50 });
        
        const planMap = { 'test': '1 Hour', '1mois': '1 Month', '3mois': '3 Month', '6mois': '6 Month', '12mois': '1 Year' };
        const selectedPlan = planMap[planId] || '1 Month';
        
        await page.click('.choices__inner'); 
        await new Promise(r => setTimeout(r, 1000));
        await page.evaluate((plan) => {
            const options = Array.from(document.querySelectorAll('.choices__item--choice'));
            const target = options.find(opt => opt.textContent.trim() === plan);
            if (target) target.click();
        }, selectedPlan);
        
        await new Promise(r => setTimeout(r, 1000));
        await page.evaluate(() => {
            const checkbox = document.querySelector('#switchBouquet');
            if (checkbox && !checkbox.checked) checkbox.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        await page.evaluate(() => {
            const bouquetItems = Array.from(document.querySelectorAll('label'));
            const franceBouquet = bouquetItems.find(label => label.textContent.includes('France'));
            if (franceBouquet) {
                const input = franceBouquet.previousElementSibling || franceBouquet.querySelector('input');
                if (input) input.click();
            }
        });

        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Confirm'));
            if (btn) btn.click();
        });
        
        await page.waitForSelector('.swal2-success', { timeout: 20000 });
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Great'));
            if (btn) btn.click();
        });
        
        await new Promise(r => setTimeout(r, 2000));
        await page.goto('https://4k.cms-only.ru/users?t=lines', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#filter_search');
        await page.type('#filter_search', customerName);
        await new Promise(r => setTimeout(r, 4000));
        
        await page.evaluate(() => {
            const firstRow = document.querySelector('#datatable-users tbody tr');
            if (firstRow) {
                const linkBtn = Array.from(firstRow.querySelectorAll('button')).find(b => b.textContent.includes('Link'));
                if (linkBtn) linkBtn.click();
            }
        });
        
        await page.waitForSelector('#myModal', { visible: true, timeout: 10000 });
        const details = await page.evaluate(() => {
            const modal = document.querySelector('#myModal');
            if (!modal) return null;
            const text = modal.innerText;
            const username = text.match(/Username:\s*([^\n]+)/)?.[1]?.trim();
            const password = text.match(/Password:\s*([^\n]+)/)?.[1]?.trim();
            const domain = text.match(/Domain:\s*([^\n]+)/)?.[1]?.trim();
            const m3u = modal.querySelector('a[href*="get.php"]')?.href || 
                        modal.querySelector('input[value*="get.php"]')?.value ||
                        modal.querySelector('.text-primary.text-break')?.innerText;
            return { username, password, domain, m3u };
        });
        
        if (details) console.log("RESULT:" + JSON.stringify(details));
        
    } catch (error) {
        console.error("ERROR:" + JSON.stringify({ error: error.message }));
        process.exit(1);
    } finally {
        await browser.close();
    }
}

const [,, customerName, planId] = process.argv;
runAutomation(customerName, planId);
