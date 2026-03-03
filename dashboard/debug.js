import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

    try {
        await page.goto('http://127.0.0.1:55617');
        await page.waitForTimeout(3000);
    } catch (err) {
        console.error('Failed to load page:', err);
    }

    await browser.close();
})();
