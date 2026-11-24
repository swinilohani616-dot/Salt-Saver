/**
 * Per-IP fixed-window rate limit, in memory. Free and dependency-free; on
 * serverless hosting each instance counts separately, so it limits abuse per
 * instance rather than globally.
 */
export function rateLimit({ windowMs = 60_000, max = 60, now = Date.now, message = 'Too many requests. Please wait a minute and try again.' } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const t = now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(ip);
    if (!entry || entry.reset <= t) {
      entry = { count: 0, reset: t + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - t) / 1000)));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
      return;
    }
    next();
  };
}
