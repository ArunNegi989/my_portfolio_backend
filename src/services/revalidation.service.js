// Tells the Next.js frontend which cached datasets changed, so saved edits show up on the
// public site on the next visit instead of after the cache lifetime.

const { getConfig } = require("../config/env");
const logger = require("../utils/logger");

let pending = Promise.resolve();

/** Fire-and-forget; failures are logged and never fail the admin request. */
function revalidateFrontend(tags) {
  const { revalidate, isTest } = getConfig();
  if (!revalidate.secret || isTest || !tags.length) return pending;
  pending = fetch(revalidate.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Revalidate-Secret": revalidate.secret },
    body: JSON.stringify({ tags: [...new Set(tags)] }),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      if (!res.ok) logger.warn({ status: res.status, tags }, "Frontend revalidation was rejected");
    })
    .catch((err) => logger.warn({ err: { name: err.name, message: err.message }, tags }, "Frontend revalidation failed"));
  return pending;
}

module.exports = { revalidateFrontend };
