import { chromium } from 'playwright';

// NOTE: Lighthouse + chrome-launcher removed — they require a real Chrome binary
// which is not available on Render free tier. We use Playwright-only scanning
// which is self-contained and works in any environment.

export class ScanEngine {
  async scanWebsite(website) {
    console.log(`🔍 Scanning: ${website.url}`);
    const results = {
      websiteId: website.id,
      timestamp: new Date().toISOString(),
      playwright: null,
      lighthouse: null,
      errors: [],
      warnings: [],
      performance: null,
      seo: null
    };

    try {
      results.playwright = await this.playwrightScan(website.url);
      results.seo = await this.seoCheck(website.url);
      results.lighthouse = await this.performanceCheck(website.url);

      results.errors = [
        ...results.playwright.errors,
        ...(results.seo?.errors || []),
        ...(results.lighthouse?.errors || [])
      ];

      results.warnings = [
        ...results.playwright.warnings,
        ...(results.seo?.warnings || []),
        ...(results.lighthouse?.warnings || [])
      ];

    } catch (err) {
      results.errors.push({ type: 'SCAN_FAILURE', message: err.message });
    }

    return results;
  }

  async playwrightScan(url) {
    let browser = null;
    const errors = [];
    const warnings = [];
    const networkErrors = [];
    let screenshot = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (compatible; AIWebsiteMonitor/1.0)'
      });
      const page = await context.newPage();

      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push({ type: 'CONSOLE_ERROR', message: msg.text() });
        } else if (msg.type() === 'warning') {
          warnings.push({ type: 'CONSOLE_WARNING', message: msg.text() });
        }
      });

      page.on('requestfailed', request => {
        networkErrors.push({
          type: 'NETWORK_ERROR',
          url: request.url(),
          failure: request.failure()?.errorText
        });
      });

      const startTime = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const loadTime = Date.now() - startTime;

      if (loadTime > 5000) {
        warnings.push({ type: 'PERFORMANCE', message: `Slow load time: ${(loadTime / 1000).toFixed(1)}s` });
      }

      // Screenshot (small, no full page to save memory)
      try {
        screenshot = await page.screenshot({ type: 'jpeg', quality: 50 });
      } catch (_) {}

      const title = await page.title().catch(() => '');
      if (!title) warnings.push({ type: 'MISSING_TITLE', message: 'Page has no title' });

      const metaDescription = await page.$eval(
        'meta[name="description"]', el => el.content
      ).catch(() => null);
      if (!metaDescription) warnings.push({ type: 'MISSING_META', message: 'Missing meta description' });

      // Check robots.txt and sitemap
      const robotsResponse = await fetch(new URL('/robots.txt', url).href).catch(() => null);
      if (!robotsResponse?.ok) warnings.push({ type: 'NO_ROBOTS', message: 'robots.txt not found' });

      const sitemapResponse = await fetch(new URL('/sitemap.xml', url).href).catch(() => null);
      if (!sitemapResponse?.ok) warnings.push({ type: 'NO_SITEMAP', message: 'sitemap.xml not found' });

      // Mobile check
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);
      const mobileLayout = await page.evaluate(() => {
        const body = document.body;
        return body.scrollWidth > window.innerWidth;
      });
      if (mobileLayout) warnings.push({ type: 'MOBILE', message: 'Page may have horizontal scroll on mobile' });

    } catch (err) {
      errors.push({ type: 'PAGE_LOAD_ERROR', message: err.message });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    return {
      errors: [...errors, ...networkErrors],
      warnings,
      screenshot: screenshot ? screenshot.toString('base64') : null
    };
  }

  // Lightweight performance check using fetch timing (no Chrome/Lighthouse needed)
  async performanceCheck(url) {
    const errors = [];
    const warnings = [];
    const scores = {};

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const start = Date.now();
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      const ttfb = Date.now() - start;

      const html = await response.text();
      const totalSize = Buffer.byteLength(html, 'utf8');

      if (ttfb > 2000) warnings.push({ type: 'PERFORMANCE', message: `High TTFB: ${ttfb}ms (should be <2000ms)` });
      if (totalSize > 500000) warnings.push({ type: 'PERFORMANCE', message: `Large HTML: ${(totalSize / 1024).toFixed(0)}KB` });

      // Basic scoring
      scores.performance = ttfb < 500 ? 90 : ttfb < 1500 ? 70 : ttfb < 3000 ? 50 : 30;
      scores.pageSize = totalSize < 100000 ? 90 : totalSize < 300000 ? 70 : 50;

    } catch (err) {
      errors.push({ type: 'PERFORMANCE_CHECK_ERROR', message: err.message });
    }

    return { scores, errors, warnings };
  }

  async seoCheck(url) {
    const errors = [];
    const warnings = [];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      const html = await response.text();

      const checks = [
        { regex: /<title[^>]*>(.*?)<\/title>/i, name: 'Title tag' },
        { regex: /<meta[^>]*name="description"[^>]*content="([^"]*)"/i, name: 'Meta description' },
        { regex: /<meta[^>]*name="viewport"[^>]*>/i, name: 'Viewport meta' },
        { regex: /<meta[^>]*property="og:title"[^>]*>/i, name: 'OG title' },
        { regex: /<meta[^>]*property="og:description"[^>]*>/i, name: 'OG description' },
        { regex: /<link[^>]*rel="canonical"[^>]*>/i, name: 'Canonical URL' }
      ];

      for (const check of checks) {
        if (!check.regex.test(html)) {
          warnings.push({ type: 'SEO_MISSING', message: `Missing: ${check.name}` });
        }
      }

      const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
      if (h1Count === 0) warnings.push({ type: 'SEO', message: 'Missing H1 tag' });
      if (h1Count > 1) warnings.push({ type: 'SEO', message: 'Multiple H1 tags found' });

      const imgs = html.match(/<img[^>]*>/gi) || [];
      const imgsWithoutAlt = imgs.filter(img => !/alt=["'][^"']*["']/i.test(img));
      if (imgsWithoutAlt.length > 0) {
        warnings.push({ type: 'SEO', message: `${imgsWithoutAlt.length} images missing alt text` });
      }

    } catch (err) {
      errors.push({ type: 'SEO_CHECK_ERROR', message: err.message });
    }

    return { errors, warnings };
  }
}
