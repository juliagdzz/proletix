// Sirve la foto de un producto desde Proletix para poder sacar su color principal en el navegador.
// Uso: /api/imagen?url=https://.../foto.jpg
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|metadata\.)/i;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

module.exports = async (req, res) => {
  let url;
  try { url = new URL(String((req.query && req.query.url) || "")); } catch { return res.status(400).end(); }
  if (!/^https?:$/.test(url.protocol) || PRIVATE.test(url.hostname)) return res.status(400).end();
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url.href, { signal: ctl.signal, headers: { "user-agent": UA, accept: "image/avif,image/webp,image/png,image/jpeg,image/*" } });
    const type = r.headers.get("content-type") || "";
    // Nada de SVG: podría llevar código y se serviría desde nuestro dominio
    if (!r.ok || !/^image\/(jpeg|png|webp|avif|gif)/i.test(type) || PRIVATE.test(new URL(r.url).hostname)) return res.status(502).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 6000000) return res.status(413).end();
    res.setHeader("Content-Type", type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).send(buf);
  } catch {
    return res.status(504).end();
  } finally {
    clearTimeout(timer);
  }
};
