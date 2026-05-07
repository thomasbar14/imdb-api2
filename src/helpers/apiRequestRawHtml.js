import puppeteer from "@cloudflare/puppeteer";

const HTML_CACHE_NAME = "imdb-html-cache";
const HTML_CACHE_TTL = 86400; // 24 hours

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

async function getCachedHtml(url) {
  try {
    const cache = await caches.open(HTML_CACHE_NAME);
    const cached = await cache.match(new Request(url));
    if (cached) {
      const text = await cached.text();
      if (text && text.length > 500 && !looksBlocked(text)) {
        return text;
      }
    }
  } catch (_) {}
  return null;
}

async function setCachedHtml(url, html) {
  try {
    const cache = await caches.open(HTML_CACHE_NAME);
    const response = new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": `max-age=${HTML_CACHE_TTL}`,
      },
    });
    await cache.put(new Request(url), response);
  } catch (_) {}
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
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Block heavy resources to speed up rendering
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "stylesheet", "font", "media", "manifest"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate and wait for JS hydration
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 25000,
    });

    // Wait for the data we actually need
    try {
      await page.waitForFunction(
        () => !!document.getElementById("__NEXT_DATA__"),
        { timeout: 15000 }
      );
    } catch (_) {
      // __NEXT_DATA__ might already be there; continue regardless
    }

    // Extract HTML with retry to handle navigation edge cases
    let html = null;
    let attempts = 0;
    while (!html && attempts < 3) {
      try {
        html = await page.evaluate(() => document.documentElement.outerHTML);
      } catch (e) {
        attempts++;
        if (attempts >= 3) throw e;
        await new Promise((r) => setTimeout(r, 1000));
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
  // 1. Check HTML cache first (fastest path)
  const cached = await getCachedHtml(url);
  if (cached) return cached;

  // 2. Standard fetch with realistic browser headers
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
        await setCachedHtml(url, text);
        return text;
      }
    }
  } catch (_) {
    // fall through to browser rendering
  }

  // 3. Browser Rendering fallback
  const html = await fetchWithBrowser(url, env);
  await setCachedHtml(url, html);
  return html;
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
