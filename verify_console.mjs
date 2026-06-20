import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
const errors = [];

page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });

const title = await page.title();
const bodyText = await page.evaluate(() => document.body.innerText);
const hasRoot = await page.evaluate(() => !!document.querySelector('#root')?.children.length);

console.log('TITLE:', title);
console.log('ROOT_HAS_CHILDREN:', hasRoot);
console.log('BODY_TEXT_SAMPLE:', bodyText.slice(0, 200));
console.log('CONSOLE_LOGS:', JSON.stringify(logs, null, 2));
console.log('PAGE_ERRORS:', JSON.stringify(errors, null, 2));

await browser.close();
