/* The string helpers every piece of markup goes through. */
import { describe, expect, it } from 'vite-plus/test';
import { cssColor, esc, initial, sgn, toneOf } from './dom';

describe('esc', () => {
  it('escapes the five characters that can break out of text or a quoted attribute', () => {
    expect(esc(`<img src=x onerror="alert('&')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;&amp;&#39;)&quot;&gt;',
    );
  });
  it('escapes every occurrence, and an already escaped string again', () => {
    expect(esc('a&b&c')).toBe('a&amp;b&amp;c');
    expect(esc('&lt;')).toBe('&amp;lt;');
  });
  it('leaves everything else alone', () => {
    expect(esc('Anne Bonny · 3/4 ✓')).toBe('Anne Bonny · 3/4 ✓');
    expect(esc('')).toBe('');
    expect(esc(42)).toBe('42');
  });
});

describe('initial', () => {
  it('is the first character, upper-cased, ignoring leading spaces', () => {
    expect(initial('  morgan')).toBe('M');
    expect(initial(3)).toBe('3');
  });
  it('falls back to a question mark and never returns markup', () => {
    expect(initial('')).toBe('?');
    expect(initial('   ')).toBe('?');
    expect(initial('<b>')).toBe('&lt;');
    expect(initial('"quoted"')).toBe('&quot;');
  });
});

describe('sgn and toneOf', () => {
  it('signs positive numbers only', () => {
    expect([sgn(20), sgn(0), sgn(-10)]).toEqual(['+20', '0', '-10']);
  });
  it('names the tone of a score', () => {
    expect([toneOf(20), toneOf(0), toneOf(-10)]).toEqual(['pos', 'zero', 'neg']);
  });
});

describe('cssColor', () => {
  it('passes the table colours through unchanged', () => {
    expect(cssColor('#1cb0f6')).toBe('#1cb0f6');
    expect(cssColor('#FF5FBF')).toBe('#FF5FBF');
  });
  it('replaces anything that is not a six-digit hex colour', () => {
    expect(cssColor('red;background:url(//evil.example/x)')).toBe('var(--blue)');
    expect(cssColor('#fff')).toBe('var(--blue)');
    expect(cssColor('"><script>')).toBe('var(--blue)');
    expect(cssColor(undefined)).toBe('var(--blue)');
  });
});
