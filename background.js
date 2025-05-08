
let hosts = new Set();
browser.storage.local.get('hosts').then(res => {
    if (res.hosts) {
        hosts = new Set(res.hosts);
    }
});

async function addHost(host) {
    hosts.add(host);
    await browser.storage.local.set({
        hosts: Array.from(hosts)
    });
}

async function receivedHeaders(details) {
    const url = new URL(details.url)
    if (hosts.has(url.host)) return;
    const cookies = details.responseHeaders.find(header => {
        return header.name.toLowerCase() == 'set-cookie';
    });
    if (!cookies) return;
    if (!cookies.value.includes('x-cmd-anubis-auth')) return;
    await addHost(url.host);
    return { redirectUrl: details.url };
}

function sentHeaders(details) {
    const url = new URL(details.url);
    if (!hosts.has(url.host)) return;
    for (const header of details.requestHeaders) {
        if (header.name.toLowerCase() != 'user-agent') continue;
        header.value = 'anubis is crap';
    }
    return { requestHeaders: details.requestHeaders };
}

browser.webRequest.onHeadersReceived.addListener(
    receivedHeaders,
    {
        urls: ['https://*/*'],
        types: ['main_frame']
    },
    [
        'blocking',
        'responseHeaders'
    ]
);

browser.webRequest.onBeforeSendHeaders.addListener(
    sentHeaders,
    {
        urls: ['https://*/*']
    },
    [
        'blocking',
        "requestHeaders"
    ]
);
