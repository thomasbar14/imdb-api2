const MODERN_CHROME_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "sec-ch-ua":
    '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  Priority: "u=0, i",
  Referer: "https://www.imdb.com/",
  DNT: "1",
};

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

export default async function apiRequestRawHtml(url) {
  const response = await fetch(url, {
    headers: MODERN_CHROME_HEADERS,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`IMDb returned status ${response.status} for ${url}`);
  }

  const text = await response.text();

  if (!text || text.length < 100) {
    throw new Error("IMDb returned empty response");
  }

  if (looksBlocked(text)) {
    throw new Error(
      "IMDb is blocking this request with a JavaScript challenge. Try accessing from a different IP or use a residential proxy."
    );
  }

  return text;
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
