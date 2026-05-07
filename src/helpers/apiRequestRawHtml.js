import puppeteer from "@cloudflare/puppeteer";

function looksBlocked(html) {
  if (!html || html.length < 500) return true;

  const indicators = [
    "cf-browser-verification",
    "challenge-platform",
    "turnstile",
    "Checking your browser",
    "Enable JavaScript",
    "cf-challenge",
    "challenge-form",
    "window._cf_chl_opt",
    "__cf_chl_jschl_tk__",
    "Please wait",
    "performance.now()",
    "jschl_vc",
    "jschl_answer",
    "cf_chl_rc_ni",
    "cf_chl_prog",
    "__cf_bm",
    "managed.challenge",
  ];

  const lower = html.toLowerCase();
  return indicators.some((s) => lower.includes(s.toLowerCase()));
}

async function fetchWithBrowser(url, env) {
  if (!env?.MYBROWSER) {
    throw new Error(
      "IMDb blocked the request and Browser Rendering is not configured. Please enable the Browser Rendering API in your Cloudflare dashboard and add the MYBROWSER binding."
    );
  }

  const browser = await puppeteer.launch(env.MYBROWSER);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Intercept and block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const resourceType = req.resourceType();
      if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate and wait for the page to settle
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Wait a bit more for any post-navigation scripts
    await new Promise((r) => setTimeout(r, 2000));

    // Wait for __NEXT_DATA__ to appear (this is what we actually need)
    try {
      await page.waitForFunction(
        () => !!document.getElementById("__NEXT_DATA__"),
        { timeout: 10000 }
      );
    } catch (_) {
      // If it doesn't appear, the page might still be useful; don't fail here
    }

    // Get HTML. Use evaluate to avoid "execution context destroyed" errors
    // from navigations that might have occurred.
    let html = null;
    let attempts = 0;
    while (!html && attempts < 3) {
      try {
        html = await page.evaluate(() => document.documentElement.outerHTML);
      } catch (e) {
        attempts++;
        if (attempts >= 3) throw e;
        // Wait for page to stabilize after navigation
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (!html) {
      throw new Error("Browser rendering failed: could not extract HTML.");
    }

    return html;
  } finally {
    await browser.close();
  }
}

export default async function apiRequestRawHtml(url, env) {
  // Attempt 1: Standard fetch with realistic browser headers
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
      },
    });

    if (response.ok) {
      const text = await response.text();
      if (!looksBlocked(text)) {
        return text;
      }
    }
  } catch (_) {
    // fall through to browser rendering
  }

  // Attempt 2: Browser Rendering fallback
  return await fetchWithBrowser(url, env);
}

export async function apiRequestJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return await response.json();
}
