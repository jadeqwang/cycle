import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'Landing Page.html'), 'utf8');

describe('landing page refresh', () => {
  test('positions Cycle as a minimalist private tracker with precise sync language', () => {
    expect(html).toContain('Cycle does one thing: track period dates simply and privately.');
    expect(html).toContain('One-purpose tracker');
    expect(html).toContain('On-device by default');
    expect(html).toContain('Private by default, explicit when synced.');
    expect(html).toContain('Calendar sync is optional.');
    expect(html).toContain('no developer-run server');
  });

  test('includes the concrete workflow and updated feature language', () => {
    expect(html).toContain('id="how-it-works"');
    expect(html).toContain('Log the date. See what comes next.');
    expect(html).toContain('Simple period logging');
    expect(html).toContain('Plain predictions');
    expect(html).toContain('Optional calendar sync');
    expect(html).toContain('Export and import');
  });

  test('removes inaccurate or overbroad claims', () => {
    const bannedPhrases = [
      'never leaves your hands',
      'every entry stays on your device',
      'one-way',
      'Free forever',
      'Cycle makes money from nothing',
      'fully open source',
      '../Cycle.html',
      'https://unpkg.com',
      'text/babel',
      'react.development.js',
      'not-band',
      'data brokers',
      'Nothing to sign up for',
      'phone-glow',
    ];

    for (const phrase of bannedPhrases) {
      expect(html).not.toContain(phrase);
    }
  });

  test('deduplicates the on-device privacy sentence', () => {
    expect(html.split('Cycle does not run a backend server').length - 1).toBe(1);
  });

  test('has production metadata, trust links, and accessible landmarks', () => {
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('screenshots/hero-social.png');
    expect(html).toContain('<nav id="nav" aria-label="Primary navigation">');
    expect(html).toContain('<main>');
    expect(html).toContain('href="/privacy.html"');
    expect(html).toContain('href="mailto:contact@cycleapp.org"');
  });

  test('uses static hero image and reduced-motion/focus styles', () => {
    expect(html).toContain('src="screenshots/hero-device.png"');
    expect(html).toContain('Cycle app showing the next predicted period and period logging controls');
    expect(html).toContain('a:focus-visible');
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain('.compact-band');
  });

  test('ships the linked privacy page and image assets', () => {
    const privacyPage = join(here, 'privacy.html');
    const heroImage = join(here, 'screenshots', 'hero-device.png');
    const socialImage = join(here, 'screenshots', 'hero-social.png');

    expect(existsSync(privacyPage)).toBe(true);
    expect(existsSync(heroImage)).toBe(true);
    expect(existsSync(socialImage)).toBe(true);
    if (existsSync(heroImage) && existsSync(socialImage)) {
      expect(statSync(heroImage).size).toBeGreaterThan(10_000);
      expect(statSync(socialImage).size).toBeGreaterThan(10_000);
    }
  });
});
