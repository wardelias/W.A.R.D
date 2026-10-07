/* W.A.R.D. service worker: offline fallback page and notifications.
 * Signed-in pages are never cached, so personal data doesn't sit in the cache. */
const CACHE = "ward-v2";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "W.A.R.D.", body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    renotify: false,
    icon: "/icon/192",
    badge: "/icon/192",
    // Android shows action buttons; iOS ignores them and opens the app on tap.
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
    data: { url: data.url || "/today", habitId: data.habitId || null, day: data.day || null },
  };
  event.waitUntil(self.registration.showNotification(data.title || "W.A.R.D.", options));
});

async function openApp(url) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of all) {
    if (new URL(client.url).origin === self.location.origin) {
      await client.focus();
      if ("navigate" in client) return client.navigate(url);
      return client;
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const { url, habitId, day } = event.notification.data || {};
  event.notification.close();
  if ((event.action === "full" || event.action === "minimum") && habitId) {
    event.waitUntil(
      fetch("/api/push/log", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitId, level: event.action, day: day || undefined }),
      }).then((res) => (res.ok ? undefined : openApp(url || "/today"))),
    );
    return;
  }
  event.waitUntil(openApp(url || "/today"));
});
