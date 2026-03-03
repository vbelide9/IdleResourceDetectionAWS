const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER ERROR:', msg.text());
        }
    });

    page.on('pageerror', exception => {
        console.log(`Uncaught JS Exception: "${exception}"`);
    });

    console.log("Navigating to dashboard...");
    await page.goto('http://localhost:55617', { waitUntil: 'domcontentloaded' });

    // Wait to see if Angular throws an asynchronous render error
    await page.waitForTimeout(3000);

    console.log("Trace complete.");
    await browser.close();
})();
