// Vercel serverless function: reports whether the hosted backend API exists.
// The Web-to-PDF tool pings this before relying on /api/fetch, so it never
// mistakes a static-host index.html fallback for a working proxy.

export default async function handler(_req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ status: "ok" });
}