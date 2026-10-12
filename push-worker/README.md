# Morning Web Push for Control Préstamos

Standalone Cloudflare Worker; never replace `respaldo-mis-apps`.

Dashboard setup: create Worker `avisos-prestamos`, paste `worker.mjs`, bind a KV namespace as `AVISOS`, and add cron `*/5 12 * * *` (UTC). Production URL expected by the client is `https://avisos-prestamos.soft-bush-7594.workers.dev`. If Cloudflare returns another account suffix, update the URL in `push-reminders.js` and `configurar-avisos.html` before activation. For CLI deployment fill the KV namespace ID in `wrangler.toml`.

The authenticated `/config` call generates VAPID signing keys in private KV. No keys or credentials are committed to source. Preserve that namespace and its `vapid` key; replacing it requires reactivating devices. Browser permissions and push subscription activation require the user to press the button on the actual phone.

Authentication verifies the existing Google-connected backup session through a read-only GET of the backup list. The new Worker does not store the session token, download backups or modify the backup service. It stores device subscriptions and future daily aggregates (date/count/amount) without client identities. Updates occur when the app is opened or records change online. Offline changes cannot reach the server until the app reconnects. Devices are independent and inherit neither push permission nor enrollment from restoring a backup. Disable on each subscribed device to revoke that device's subscription. Disconnecting Drive does not revoke an already-enrolled push subscription.

Cron begins at 09:00 Argentina and retries transient failures every five minutes through 09:55. Successful sends are marked by date; expired subscriptions are deleted. KV consistency and push-provider retries do not provide strict exactly-once delivery; notifications share a daily tag without renotify. TTL is 30 minutes, so an offline phone may miss the reminder rather than receive it many hours later. Only pending installments due on that date are included, matching the existing local reminder behavior. No automatic payments, financial data mutations, or overdue-date reclassification occur.

Verification: `node --test tests/push-worker.test.mjs tests/financing-model.test.cjs`; syntax checks for the Worker, app, client and service worker. RFC8291 interoperability additionally checked by decrypting an encrypted payload with the independent `http_ece` package. Real production cron and delivery require dashboard setup and a notification test on the physical phone.
