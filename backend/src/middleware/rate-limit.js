/* =========================================================================
   CVlight — middleware/rate-limit.js
   Limitador de peticiones en memoria, sin dependencias.

   Protege la cuota de la IA en la demo: cada IP tiene un cupo por ventana de
   tiempo. No es un limitador distribuido; alcanza para un servidor local.
   ========================================================================= */

function rateLimit({ windowMs = 60_000, max = 30, message } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || "local";
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        message: message || `Demasiadas peticiones. Probá de nuevo en ${retryAfter}s.`,
      });
    }

    next();
  };
}

module.exports = { rateLimit };
