// Vercel serverless function: proxies an arbitrary URL so the Web-to-PDF
// tool can read any site from the browser (CORS is not required because the
// fetch happens on the server). Deployed alongside the static build at
// /api/fetch?url=<encoded-url>. See server/scissors_server/main.py for the
// equivalent endpoint in the local Python backend.

const FETCH_TIMEOUT_MS = 20000;
const MAX_FETCH_BYTES = 25 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0 Safari/537.36";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Only GET is supported." });
    return;
  }

  const parsed = new URL(req.url, "http://localhost");
  const target = parsed.searchParams.get("url");
  if (!target) {
    res.status(400).json({ error: "Missing url query parameter." });
    return;
  }

  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    res.status(400).json({ error: "Invalid url." });
    return;
  }
  if (!["http:", "https:"].includes(upstream.protocol)) {
    res.status(400).json({ error: "Only http/https URLs can be fetched." });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT },
    });
    clearTimeout(timer);

    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_FETCH_BYTES) {
      res.status(413).json({ error: "The page is larger than 25 MB." });
      return;
    }

    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    res.status(response.status);
    res.setHeader("Content-Type", contentType.split(";")[0]);
    res.send(body);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      res.status(504).json({ error: "The page did not respond in time." });
    } else {
      res.status(502).json({ error: String(error?.message ?? error) });
    }
  }
}
