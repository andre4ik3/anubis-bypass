if (document.getElementById('title')?.textContent == "Making sure you're not a bot!") {
    console.info('Anubis detected!');
    browser.runtime.sendMessage(document.location.host).then(() => {
        if(window.location.pathname.startsWith('/.')) return window.history.go(-1);
        window.location.reload();
    });
}
