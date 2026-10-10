// @ts-check

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** @returns {string} */
function generateUserAgentComponent() {
  const length = Math.round(Math.random() * 4) + 4;
  let name = "";

  for (let i = 0; i < length; i++) {
    name += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }

  // version
  if (Math.random() > 0.6) {
    const version = Array
      .from({ length: Math.round(Math.random() * 3) + 1 }, () => Math.round(Math.random() * 20))
      .join(".");

    name += `/${version}`;
  }

  return name;
}

/** @returns {string} */
function generateUserAgent() {
  const agent = Array
    .from({ length: Math.round(Math.random() * 3) + 1 }, generateUserAgentComponent)
    .join(" ");

  if (agent.toLowerCase().includes("bot")) return generateUserAgent();

  return agent;
}

/** @param {string} str */
function hash(str) {
  let out = 0x811C9DC5;
  for (let i = 0; i < str.length; i++) {
    out ^= str.charCodeAt(i);
    out = Math.imul(out, 0x01000193);
  }
  return Math.max(2, out & 0x7FFFFFFF);
}

/** @type {Map<string, Promise<boolean>>} */
const pendingOrigins = new Map();

/** @param {string} origin */
function addOrigin(origin) {
  const pending = pendingOrigins.get(origin);
  if (pending) return pending;

  const update = (async () => {
    const rules = await browser.declarativeNetRequest.getSessionRules();
    const urlFilter = `|${origin}/`;
    if (rules.some((rule) => rule.condition.urlFilter === urlFilter)) return false;

    const agent = generateUserAgent();
    /** @type {browser.declarativeNetRequest.Rule["condition"]} */
    const condition = {
      urlFilter,
      resourceTypes: [
        "main_frame",
        "sub_frame",
        "stylesheet",
        "script",
        "image",
        "font",
        "object",
        "xmlhttprequest",
        "ping",
        "csp_report",
        "media",
        "websocket",
        "other",
      ],
    };

    console.info(`Adding ${origin} to origins: ${agent}`);
    await browser.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id: hash(`${origin}/modify`),
          priority: 3,
          condition,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "user-agent", operation: "set", value: agent }],
          },
        },
        {
          id: hash(`${origin}/allow`),
          priority: 2,
          condition,
          action: { type: "allow" },
        },
      ],
    });
    return true;
  })().finally(() => pendingOrigins.delete(origin));
  pendingOrigins.set(origin, update);
  return update;
}

if (!browser.runtime.getBrowserInfo) {
  // Register synchronously so a message can wake a suspended Chromium worker.
  browser.runtime.onMessage.addListener(async (message, sender) => {
    const blockedURL = browser.runtime.getURL("blocked.html");
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(`${blockedURL}#`)) return;
    if (typeof message?.url !== "string" || message.url !== sender.url.slice(blockedURL.length + 1)) {
      throw new Error("Invalid retry URL");
    }
    const url = new URL(message.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid retry protocol");
    await addOrigin(url.origin);
    return true;
  });

  // Session rules survive worker suspension. Never clear the learned origins on wake-up.
  browser.declarativeNetRequest.getSessionRules().then((rules) => {
    if (rules.some((rule) => rule.id === 1)) return;
    return browser.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: 1,
        condition: {
          regexFilter: "^https?://.*",
          resourceTypes: ["main_frame", "sub_frame"],
          // @ts-expect-error Firefox types omit Chromium response-header conditions.
          responseHeaders: [{
            header: "set-cookie",
            values: ["*-anubis-*=*"],
            // ponytail: skip markers in values; parse headers if Anubis tokens ever contain one.
            excludedValues: ["*=*-anubis-*"],
          }],
        },
        action: {
          type: "redirect",
          redirect: { regexSubstitution: `${browser.runtime.getURL("blocked.html")}#\\0` },
        },
      }],
    });
  }).catch((error) => console.error("Could not install Anubis redirect rule", error));
} else {
  // Firefox can retry the original request directly before accepting challenge cookies.
  browser.webRequest.onHeadersReceived.addListener(
    async (details) => {
      // Use the same conservative name/value match as Chromium's header glob.
      const challenge = details.responseHeaders?.some((header) =>
        header.name.toLowerCase() === "set-cookie" &&
        /^[^=]*-anubis-[^=]*=/i.test(header.value ?? "") &&
        !/=.*-anubis-/i.test(header.value ?? "")
      );
      if (!challenge) return {};
      if (!await addOrigin(new URL(details.url).origin)) return {};
      return { redirectUrl: details.url };
    },
    { urls: ["*://*/*"], types: ["main_frame", "sub_frame"] },
    ["responseHeaders", "blocking"],
  );
}
