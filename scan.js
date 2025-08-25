if (document.getElementById('title')?.textContent == "Making sure you're not a bot!") {
    console.info('Anubis detected!');
    browser.runtime.sendMessage(document.location.host).then(() => {
        document.location.reload();
    });
}
