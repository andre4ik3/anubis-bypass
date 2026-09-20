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
export function generateUserAgent() {
  const agent = Array
    .from({ length: Math.round(Math.random() * 3) + 1 }, generateUserAgentComponent)
    .join(" ");

  if (agent.toLowerCase().includes("bot")) return generateUserAgent();

  return agent;
}

/** @param {string} str */
export function hash(str) {
  let out = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    out ^= str.charCodeAt(i);
    out = Math.imul(out, 0x01000193);
  }
  return out >>> 0;
}

/** @param {string} host */
async function hasHost(host) {
  const rules = await browser.declarativeNetRequest.getDynamicRules();
  return rules.some((rule) => rule.condition.requestDomains?.includes(host));
}

/** @param {string} host */
async function addHost(host) {
  console.info(`Adding ${host} to hosts`);
  await browser.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id: hash(host) + 1,
      condition: {
        requestDomains: [host],
        excludedResourceTypes: [],
      },
      action: {
        type: "modifyHeaders",
        requestHeaders: [{
          header: "user-agent",
          operation: "set",
          value: generateUserAgent(),
        }],
      },
    }],
  });
}

// Chromium needs "extraHeaders" to let us read Set-Cookie, Firefox doesn't and doesn't allow unknown enum cases
const extraInfoSpec = ["responseHeaders"];
if (browser.webRequest.OnHeadersReceivedOptions?.EXTRA_HEADERS) {
  extraInfoSpec.push("extraHeaders");
}

browser.webRequest.onHeadersReceived.addListener(
  async (details) => {
    const url = new URL(details.url);
    console.info(`Handling ${url}`);
    if (await hasHost(url.host)) return;

    const cookies = details.responseHeaders?.find((h) => h.name.toLowerCase() == "set-cookie");
    if (!cookies?.value?.includes("-anubis-")) return;

    await addHost(url.host);
    browser.tabs.reload(details.tabId);
  },
  {
    urls: ["*://*/*"],
    types: ["main_frame"],
  },
  extraInfoSpec,
);
