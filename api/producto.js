// Lee la página de un producto y devuelve sus datos: nombre, precio, medidas, foto y descripción.
// Uso: /api/producto?url=https://www.ikea.com/es/es/p/...
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|metadata\.)/i;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}
function meta(html, key) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, "i"));
  if (!tag) return "";
  const c = tag[0].match(/content=["']([^"']*)["']/i);
  return c ? decode(c[1]) : "";
}
function jsonld(html) {
  const out = [], re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1].trim())); } catch {} }
  return out;
}
function findProduct(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findProduct(n); if (f) return f; } return null; }
  const t = node["@type"], types = Array.isArray(t) ? t : [t];
  if (types.includes("Product") || types.includes("ProductGroup")) return node;
  for (const k of ["@graph", "mainEntity", "itemListElement", "item"]) {
    if (node[k]) { const f = findProduct(node[k]); if (f) return f; }
  }
  return null;
}
const num = v => {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
function toCm(q) {
  if (q == null) return null;
  if (typeof q !== "object") return num(q);
  const v = num(q.value); if (v == null) return null;
  const u = String(q.unitCode || q.unitText || "CMT").toUpperCase();
  return u === "MMT" || u === "MM" ? v / 10 : u === "MTR" || u === "M" ? v * 100 : v;
}
function price(offers) {
  if (!offers) return null;
  for (const o of Array.isArray(offers) ? offers : [offers]) {
    const spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
    const p = num(o.price) ?? num(o.lowPrice) ?? num(spec && spec.price);
    if (p) return p;
    if (o.offers) { const q = price(o.offers); if (q) return q; }
  }
  return null;
}
function textOf(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
}
function dims(t) {
  const n = v => num(v);
  const g = re => { const m = t.match(re); return m ? n(m[1]) : null; };
  const out = {
    ancho: g(/(?:ancho|anchura)[^\d]{0,25}(\d+(?:[.,]\d+)?)\s*cm/i),
    fondo: g(/(?:fondo|profundidad)[^\d]{0,25}(\d+(?:[.,]\d+)?)\s*cm/i),
    alto: g(/(?:alto|altura)[^\d]{0,25}(\d+(?:[.,]\d+)?)\s*cm/i),
    diametro: g(/(?:di[aá]metro|[Øø⌀])[^\d]{0,15}(\d+(?:[.,]\d+)?)\s*cm/i),
  };
  if (out.diametro && !out.ancho) { out.ancho = out.fondo = out.diametro; }
  if (!out.ancho) {
    const m = t.match(/(\d{2,3}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3}(?:[.,]\d)?)(?:\s*[x×]\s*(\d{2,3}(?:[.,]\d)?))?\s*cm/i);
    if (m) { out.ancho = n(m[1]); out.fondo = n(m[2]); if (m[3]) out.alto = n(m[3]); }
  }
  return out;
}
function extract(html, url) {
  const prod = findProduct(jsonld(html)) || {};
  const first = v => (Array.isArray(v) ? v[0] : v);
  let imagen = first(prod.image);
  if (imagen && typeof imagen === "object") imagen = imagen.url || imagen.contentUrl;
  imagen = imagen || meta(html, "og:image");
  try { imagen = imagen ? new URL(imagen, url).href : ""; } catch { imagen = ""; }
  const nombre = decode(prod.name) || meta(html, "og:title") || decode((html.match(/<title[^>]*>([^<]*)/i) || [])[1]);
  const precio = price(prod.offers) || num(meta(html, "product:price:amount")) || num(meta(html, "og:price:amount")) || num(meta(html, "price"));
  let ancho = toCm(prod.width), fondo = toCm(prod.depth), alto = toCm(prod.height), diametro = null;
  for (const p of Array.isArray(prod.additionalProperty) ? prod.additionalProperty : []) {
    const name = String(p.name || "").toLowerCase(), v = toCm(p.unitCode ? p : p.value);
    if (!ancho && /ancho|width/.test(name)) ancho = v;
    if (!fondo && /fondo|profund|depth/.test(name)) fondo = v;
    if (!alto && /alto|altura|height/.test(name)) alto = v;
    if (!diametro && /diam/.test(name)) diametro = v;
  }
  const d = dims(textOf(html));
  diametro = diametro || d.diametro;
  if (diametro && !ancho) { ancho = fondo = diametro; }
  ancho = ancho || d.ancho; fondo = fondo || d.fondo; alto = alto || d.alto;
  const marca = prod.brand && typeof prod.brand === "object" ? prod.brand.name : prod.brand;
  return {
    nombre: nombre.slice(0, 90),
    tienda: meta(html, "og:site_name") || "",
    marca: marca || "",
    precio, ancho, fondo, alto, imagen,
    redondo: !!diametro || /redond[ao]s?\b|ovalad/i.test(nombre),
    nota: decode(prod.description || meta(html, "og:description")).replace(/\s+/g, " ").slice(0, 140),
  };
}

// Lee la página. Si la tienda bloquea la visita (403, 429…) y hay clave de ScraperAPI
// en las variables de entorno de Vercel (SCRAPER_API_KEY), lo reintenta a través de ese servicio.
async function getPage(url) {
  const timed = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };
  let status = 0;
  const a = timed(9000);
  try {
    const r = await fetch(url.href, { signal: a.signal, redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "es-ES,es;q=0.9" } });
    if (PRIVATE.test(new URL(r.url).hostname)) return { error: 400 };
    if (r.ok) return { html: await r.text() };
    status = r.status;
  } catch { status = 504; } finally { a.done(); }
  const key = process.env.SCRAPER_API_KEY;
  if (!key || ![401, 403, 429, 503, 504].includes(status)) return { error: status };
  const b = timed(50000);
  try {
    const api = `https://api.scraperapi.com/?api_key=${encodeURIComponent(key)}&country_code=es&url=${encodeURIComponent(url.href)}`;
    const r = await fetch(api, { signal: b.signal });
    if (r.ok) return { html: await r.text(), via: "scraperapi" };
    return { error: r.status, via: "scraperapi" };
  } catch { return { error: 504, via: "scraperapi" }; } finally { b.done(); }
}

module.exports = async (req, res) => {
  let url;
  try { url = new URL(String((req.query && req.query.url) || "")); } catch { return res.status(400).json({ error: "El enlace no es válido." }); }
  if (!/^https?:$/.test(url.protocol) || PRIVATE.test(url.hostname)) return res.status(400).json({ error: "El enlace no es válido." });
  const page = await getPage(url);
  if (page.error === 400) return res.status(400).json({ error: "El enlace no es válido." });
  if (page.error === 504) return res.status(504).json({ error: "La tienda ha tardado demasiado en responder." });
  if (page.error) {
    const why = page.via ? `La tienda tampoco deja leer la página a través de ScraperAPI (error ${page.error}).` : `La tienda no deja leer esta página (error ${page.error}).`;
    return res.status(502).json({ error: why });
  }
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json(extract(page.html.slice(0, 4000000), url));
};
module.exports.extract = extract;
