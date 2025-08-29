
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

browser.runtime.onMessage.addListener(async (host) => {
    console.info('Adding', host, 'to hosts');
    await addHost(host);
});

async function receivedHeaders(details) {
    const url = new URL(details.url)
    if (hosts.has(url.host)) return;
    const cookies = details.responseHeaders.find(header => {
        return header.name.toLowerCase() == 'set-cookie';
    });
    if (!cookies) return;
    if (!cookies.value.includes('-anubis-')) return;
    await addHost(url.host);
    return { redirectUrl: details.url };
}

function generateUserAgent() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const length = Math.round(Math.random() * 16) + 16;
    let agent = '';
    for(let i = 0; i < length; i++){
        if(Math.random() > 0.8){
            agent += ' ';
            continue;
        }
        agent += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if(agent.toLowerCase().includes('bot')) return generateUserAgent();
    return agent;
}

function sentHeaders(details) {
    const url = new URL(details.url);
    if (!hosts.has(url.host)) return;
    for (const header of details.requestHeaders) {
        if (header.name.toLowerCase() != 'user-agent') continue;
        header.value = generateUserAgent();
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
