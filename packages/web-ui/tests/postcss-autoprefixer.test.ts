import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

async function processWithAutoprefixer(css: string, browsers: string[]): Promise<string> {
  const result = await postcss([
    autoprefixer({
      overrideBrowserslist: browsers,
    }),
  ]).process(css, { from: undefined });

  return result.css;
}

describe('postcss autoprefixer', () => {
  it('adds vendor prefixes for legacy browser targets', async () => {
    const output = await processWithAutoprefixer('.x{user-select:none;display:flex}', [
      'Chrome 30',
      'Firefox 20',
    ]);

    expect(output).toContain('-webkit-user-select:none');
    expect(output).toContain('-moz-user-select:none');
    expect(output).toContain('display:-moz-box');
  });

  it('preserves custom properties inside gradients', async () => {
    const output = await processWithAutoprefixer(
      '.x{background:linear-gradient(var(--angle), red, blue)}',
      ['Safari 6'],
    );

    expect(output).toContain('linear-gradient(var(--angle), red, blue)');
  });
});
