const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const PENDING_FILE = path.join(__dirname, "pending_renewals.json");
const TRIAL_LOG_FILE = path.join(__dirname, "trial_log.json");

const CREDIT_COSTS = {
  test: 0,
  "1mois": 1,
  "3mois": 3,
  "6mois": 6,
  "12mois": 12,
};

async function runAutomation(customerName, planId, action = "add", email = "") {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto("https://4k.cms-only.ru/login", { waitUntil: "networkidle2" });
    await page.waitForSelector("#uname");
    await page.type("#uname", "ihebfrance", { delay: 50 });
    await page.type("#password-input", "france108", { delay: 50 });

    const verifyBtn = await page.$("button.btn-success");
    if (verifyBtn) {
      await verifyBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
    }
    await page.click("button[type=\"submit\"]");
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // 1. Get Dynamic Trial Limit and Current Credits
    const dashboardData = await page.evaluate(() => {
      const h5s = Array.from(document.querySelectorAll("h5"));
      const creditH5 = h5s.find((h) => h.textContent.includes("Credits"));
      const trialH5 = h5s.find((h) =>
        h.textContent.includes("Daily Trial Limit")
      );

      return {
        credits: creditH5
          ? parseInt(creditH5.textContent.match(/(\d+)/)?.[1] || 0)
          : 0,
        trialLimit: trialH5
          ? parseInt(trialH5.textContent.match(/(\d+)/)?.[1] || 10)
          : 10,
      };
    });

    // Check local trial count
    const today = new Date().toISOString().split("T")[0];
    let trialLog = { date: today, count: 0 };
    if (fs.existsSync(TRIAL_LOG_FILE)) {
      const savedLog = JSON.parse(fs.readFileSync(TRIAL_LOG_FILE));
      if (savedLog.date === today) trialLog = savedLog;
    }

    let finalPlanId = planId;
    let isTrialFallback = false;
    const cost = CREDIT_COSTS[planId] || 1;

    // Smart Logic: If (Current - Cost) < 12, fallback to trial
    if (dashboardData.credits - cost < 12 && planId !== "test") {
      if (trialLog.count < dashboardData.trialLimit) {
        finalPlanId = "test";
        isTrialFallback = true;
        const pending = fs.existsSync(PENDING_FILE)
          ? JSON.parse(fs.readFileSync(PENDING_FILE))
          : [];
        pending.push({ customerName, planId, email, date: new Date().toISOString() });
        fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
      } else {
        throw new Error("LOW_CREDITS_AND_TRIAL_LIMIT_REACHED");
      }
    }

    if (finalPlanId === "test" && trialLog.count >= dashboardData.trialLimit) {
      throw new Error("TRIAL_LIMIT_REACHED");
    }

    let planLabel = "1 Month";
    if (finalPlanId === "test") {
      planLabel = planId === "test" ? "5 Hours" : "24 Hours";
    } else {
      const planMap = {
        "1mois": "1 Month",
        "3mois": "3 Month",
        "6mois": "6 Month",
        "12mois": "1 Year",
      };
      planLabel = planMap[finalPlanId] || "1 Month";
    }

    if (action === "add") {
      // Add User Logic
      await page.goto("https://4k.cms-only.ru/addnew?t=lines", { waitUntil: "networkidle2" });
      await page.waitForSelector("#mac");
      await page.type("#mac", customerName);

      await page.click(".choices__inner");
      await new Promise((r) => setTimeout(r, 1000));
      await page.evaluate((label) => {
        const opt = Array.from(document.querySelectorAll(".choices__item--choice")).find(
          (o) => o.textContent.includes(label)
        );
        if (opt) opt.click();
      }, planLabel);

      // France Bouquet
      await page.evaluate(() => {
        const cb = document.querySelector("#switchBouquet");
        if (cb && !cb.checked) cb.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
      await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll("label"));
        const france = labels.find((l) => l.textContent.includes("France"));
        if (france) {
          const input = france.previousElementSibling || france.querySelector("input");
          if (input) input.click();
        }
      });

      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Confirm")
        );
        if (btn) btn.click();
      });

      await page.waitForSelector(".swal2-success", { timeout: 20000 });

      // Update trial count if needed
      if (finalPlanId === "test") {
        trialLog.count += 1;
        fs.writeFileSync(TRIAL_LOG_FILE, JSON.stringify(trialLog));
      }

      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Great")
        );
        if (btn) btn.click();
      });
    } else if (action === "renew") {
      // Renew User Logic
      await page.goto("https://4k.cms-only.ru/users?t=lines", { waitUntil: "networkidle2" });
      await page.waitForSelector("#filter_search");
      await page.type("#filter_search", customerName);
      await new Promise((r) => setTimeout(r, 4000)); 

      await page.evaluate((planLabel) => {
        const row = document.querySelector("#datatable-users tbody tr");
        if (row) {
          const renewBtn = Array.from(row.querySelectorAll("button")).find(
            (b) => b.textContent.includes("Renew")
          );
          if (renewBtn) {
            renewBtn.click();
          }
        }
      }, planLabel);

      await page.waitForSelector(".swal2-popup", { visible: true });

      await page.click(".choices__inner");
      await new Promise((r) => setTimeout(r, 1000));
      await page.evaluate((label) => {
        const opt = Array.from(document.querySelectorAll(".choices__item--choice")).find(
          (o) => o.textContent.includes(label)
        );
        if (opt) opt.click();
      }, planLabel);

      await page.evaluate(() => {
        const confirmRenewBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.includes("Confirm")
        );
        if (confirmRenewBtn) confirmRenewBtn.click();
      });
      await page.waitForSelector(".swal2-success", { timeout: 20000 });
      await page.evaluate(() => {
        const greatBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.includes("Great")
        );
        if (greatBtn) greatBtn.click();
      });
    }

    // 3. Extract Details
    await page.goto("https://4k.cms-only.ru/users?t=lines", { waitUntil: "networkidle2" });
    await page.waitForSelector("#filter_search");
    await page.type("#filter_search", customerName);
    await new Promise((r) => setTimeout(r, 4000));

    // Click Action (Gear)
    await page.evaluate(() => {
      const row = document.querySelector("#datatable-users tbody tr");
      const gearIcon = row ? row.querySelector("button.dropdown-toggle") : null;
      if (gearIcon) gearIcon.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Click QR Edit Package
    await page.evaluate(() => {
      const qrBtn = Array.from(document.querySelectorAll("a")).find(
        (a) => a.textContent.includes("QR Edit Package")
      );
      if (qrBtn) qrBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    let qrLink = "No QR/Link found";
    try {
      await page.waitForSelector("#myModalQR", { visible: true, timeout: 5000 });
      qrLink = await page.evaluate(() => {
        const modal = document.querySelector("#myModalQR");
        if (modal) {
          const link = modal.querySelector("a[href]");
          if (link) return link.href;
          const img = modal.querySelector("img[src*=\"qr.php\"]");
          if (img) return img.src;
        }
        return "No QR/Link found";
      });
      await page.evaluate(() => {
        const close = document.querySelector("#myModalQR .close");
        if (close) close.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      if (page.url().includes("qr.php")) {
        qrLink = page.url();
        await page.goBack({ waitUntil: "networkidle2" });
      }
    }

    // Extract M3U
    await page.evaluate(() => {
      const row = document.querySelector("#datatable-users tbody tr");
      const btn = row ? Array.from(row.querySelectorAll("button")).find(b => b.textContent.includes("Link")) : null;
      if (btn) btn.click();
    });

    await page.waitForSelector("#myModal", { visible: true, timeout: 10000 });
    const details = await page.evaluate(() => {
      const modal = document.querySelector("#myModal");
      if (!modal) return null;
      const text = modal.innerText;
      return {
        username: text.match(/Username:\s*([^\n]+)/)?.[1]?.trim(),
        password: text.match(/Password:\s*([^\n]+)/)?.[1]?.trim(),
        domain: text.match(/Domain:\s*([^\n]+)/)?.[1]?.trim(),
        m3u: modal.querySelector("a[href*=\"get.php\"]")?.href || modal.querySelector("input[value*=\"get.php\"]")?.value || modal.querySelector(".text-primary.text-break")?.innerText,
      };
    });

    if (details) {
      details.isTrialFallback = isTrialFallback;
      details.planDuration = planLabel;
      details.qrLink = qrLink;
      console.log("RESULT:" + JSON.stringify(details));
    }
  } catch (error) {
    console.error("ERROR:" + JSON.stringify({ error: error.message }));
    process.exit(1);
  } finally {
    await browser.close();
  }
}

const [,, customerName, planId, action, email] = process.argv;
runAutomation(customerName, planId, action, email);

