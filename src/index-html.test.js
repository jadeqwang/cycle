import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html icons', () => {
  test('declares a favicon so Chrome does not request missing /favicon.ico', () => {
    expect(indexHtml).toMatch(/<link\s+rel="icon"\s+href="\/icons\/favicon\.ico"\s*\/>/);
  });
});
