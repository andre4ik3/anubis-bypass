// @ts-check
(async () => {
  const url = location.hash.slice(1);
  if (!url) return;
  try {
    const ready = await browser.runtime.sendMessage({ url });
    if (ready !== true) throw new Error("Background worker did not confirm the bypass rule");
    location.replace(url);
  } catch (error) {
    document.body.style.opacity = "1";
    document.body.textContent = `Could not enable Anubis bypass: ${error}. Reload this page to retry.`;
  }
})();
