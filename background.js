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
  return (out & 0x7FFFFFFF) || 1;
}

/** @param {string} host */
async function hasHost(host) {
  const rules = await browser.declarativeNetRequest.getSessionRules();
  return rules.some((rule) => rule.condition.requestDomains?.includes(host));
}

/** @param {string} host */
async function addHost(host) {
  if (await hasHost(host)) return;

  const agent = generateUserAgent();
  const condition = {
    requestDomains: [host],
    resourceTypes: Object.values(browser.declarativeNetRequest.ResourceType),
  };

  console.info(`Adding ${host} to hosts: ${agent}`);

  await browser.declarativeNetRequest.updateSessionRules({
    addRules: [
      // In matching precedence, higher priority gets evaluated first
      // An "allow" rule is basically an instant short-circuit, so the headers modification comes first
      {
        id: hash(`${host}/modify`),
        priority: 3,
        condition,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{
            header: "user-agent",
            operation: "set",
            value: agent,
          }],
        },
      },
      {
        id: hash(`${host}/allow`),
        priority: 2,
        condition,
        action: { type: "allow" },
      },
    ],
  });
}

(async () => {
  // Chromium needs "extraHeaders" to let us read Set-Cookie, Mozilla doesn't and doesn't allow unknown enum cases
  /** @type {browser.webRequest.OnHeadersReceivedOptions[]} */
  const extraInfoSpec = ["responseHeaders"];
  if (browser.webRequest.OnHeadersReceivedOptions?.EXTRA_HEADERS) {
    extraInfoSpec.push("extraHeaders");
  }

  // Clear any existing session rules we have
  const rules = await browser.declarativeNetRequest.getSessionRules();
  await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map((r) => r.id) });

  // To prevent the actual challenge page from loading (and the browser accepting cookies and starting to solve it), we
  // redirect to a blocked page while we add the DNR rule to modify the UA in the background.
  // The way to add such a rule, however, depends on the browser...

  if (browser.declarativeNetRequest.RuleConditionKeys?.RESPONSE_HEADERS) {
    // yep, mozilla does not support this
    console.info("Using DNR with redirect action (this is probably Chromium)");
    await browser.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: 1,
        condition: {
          resourceTypes: ["main_frame", "sub_frame"],
          responseHeaders: [{ header: "set-cookie", values: ["*-anubis-*"] }],
        },
        action: {
          type: "redirect",
          redirect: { url: browser.runtime.getURL("blocked.html") },
        },
      }],
    });
  } else if (await browser.permissions.contains({ permissions: ["webRequestBlocking"] })) {
    // yep, chromium does not support this
    console.info("Using blocking webRequest (this is probably Mozilla)");
    extraInfoSpec.push("blocking");
  } else {
    console.warn("Could not figure out a way to redirect to blocked page");
  }

  await browser.webRequest.onHeadersReceived.addListener(
    async (details) => {
      const url = new URL(details.url);

      // For Mozilla: short-circuit and don't redirect again if we handled the host and it still challenges us
      if (await hasHost(url.host)) return {};

      const cookies = details.responseHeaders?.find((h) => h.name.toLowerCase() == "set-cookie");
      if (!cookies?.value?.includes("-anubis-")) return {};

      await addHost(url.host);

      // Since we redirected to our blocked page (hopefully), now we can redirect back.
      // If we didn't redirect, this would be a no-op.
      // In Mozilla, we run this right before we return the blocking redirect, hopefully it runs after the redirect.
      // In Chromium, the DNR matching on response headers would have already redirected us.
      browser.tabs.update(details.tabId, { url: details.url });

      // Will only work if we passed "blocking" to extraInfoSpec (which itself will only work if we have
      // "webRequestBlocking" permission, which only Mozilla gives us)
      return { redirectUrl: browser.runtime.getURL("blocked.html") };
    },
    {
      urls: ["*://*/*"],
      types: ["main_frame", "sub_frame"],
    },
    extraInfoSpec,
  );
})();
