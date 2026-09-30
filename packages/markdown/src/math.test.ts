/**
 * KaTeX rendering checks.
 *
 * These tests prove the three promises of `./math.ts`: valid math renders to
 * sanitized spans, hostile or oversized sources never produce markup, and
 * failures throw `MathRenderError` so the caller can keep editable source.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSafeMathStyle,
  mathLimits,
  MathRenderError,
  renderMath,
  sanitizeMathHtml,
} from './math.ts';

await test('inline math renders to KaTeX spans with no script surface', () => {
  const html = renderMath('E = mc^2', false);
  assert.ok(html.includes('class="katex"'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!/\son[a-z]+=/i.test(html));
});

await test('display math renders in display mode', () => {
  const html = renderMath('\\int_0^1 x^2', true);
  assert.ok(html.includes('class="katex"'));
});

await test('an untrusted command renders as text and never as a link', () => {
  const href = renderMath('\\href{https://evil.example}{x}', false);
  assert.ok(!href.includes('<a'));
  assert.ok(!href.includes('https://evil.example'));
  assert.ok(href.includes('class="katex"'));
  const include = renderMath('\\includegraphics{evil.png}', false);
  assert.ok(!include.includes('<img'));
});

await test('the sanitizer drops non span elements but keeps their text', () => {
  const cleaned = sanitizeMathHtml(
    '<span class="katex">ok</span><script>alert(1)</script><a href="https://evil.example">text</a>',
  );
  assert.ok(cleaned.includes('<span class="katex">ok</span>'));
  assert.ok(!cleaned.includes('<script'));
  assert.ok(!cleaned.includes('<a'));
  assert.ok(cleaned.includes('text'));
});

await test('the sanitizer drops event handlers and unsafe styles', () => {
  const cleaned = sanitizeMathHtml(
    '<span class="katex" onclick="alert(1)" style="height:0.68em;background:url(evil)">x</span>',
  );
  assert.ok(!cleaned.includes('onclick'));
  assert.ok(!cleaned.includes('url('));
  assert.ok(!cleaned.includes('background'));
  assert.ok(cleaned.includes('height:0.68em'));
});

await test('an oversized source throws a limit error', () => {
  const source = `x+${'y'.repeat(mathLimits.maxSourceChars)}`;
  assert.throws(() => renderMath(source, false), MathRenderError);
  try {
    renderMath(source, false);
    assert.fail('renderMath did not throw');
  } catch (error: unknown) {
    assert.ok(error instanceof MathRenderError);
    assert.equal(error.reason, 'limit');
  }
});

await test('a macro flood throws a limit error', () => {
  const source = '\\frac '.repeat(mathLimits.maxMacros + 1);
  assert.throws(() => renderMath(source, false), MathRenderError);
});

await test('invalid syntax throws a syntax error', () => {
  assert.throws(() => renderMath('\\htmlData{a}{b}', false), MathRenderError);
  try {
    renderMath('\\htmlData{a}{b}', false);
    assert.fail('renderMath did not throw');
  } catch (error: unknown) {
    assert.ok(error instanceof MathRenderError);
    assert.equal(error.reason, 'syntax');
  }
});

await test('an unclosed source throws rather than emitting markup', () => {
  assert.throws(() => renderMath('\\frac{1}{', false), MathRenderError);
});

await test('the sanitizer keeps the drawing elements of a radical', () => {
  const html = renderMath('\\sqrt{x}', false);
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('<path'));
  assert.ok(/ d="[Mm][^"]*"/.test(html));
  assert.ok(!html.includes('onload'));
});

await test('the sanitizer refuses a drawing attribute that is not a number', () => {
  const cleaned = sanitizeMathHtml(
    '<svg width="400em" height="javascript:1" viewBox="0 0 1 2"><path d="M1,2z" onclick="x"/></svg>',
  );
  assert.ok(cleaned.includes('width="400em"'));
  assert.ok(cleaned.includes('viewBox="0 0 1 2"'));
  assert.ok(!cleaned.includes('javascript:'));
  assert.ok(!cleaned.includes('onclick'));
  assert.ok(cleaned.includes('<path d="M1,2z"/>'));
});

await test('the sanitizer drops the LaTeX annotation with its text', () => {
  const cleaned = sanitizeMathHtml(
    '<span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">\\alpha</annotation></semantics></math></span>',
  );
  assert.ok(cleaned.includes('x'));
  assert.ok(!cleaned.includes('\\alpha'));
  assert.ok(!cleaned.includes('annotation'));
});

await test('accented text in math mode renders instead of failing', () => {
  const html = renderMath('café', false);
  assert.ok(html.includes('class="katex"'));
});

await test('the MathML branch reaches a screen reader', () => {
  const html = renderMath('x^2', false);
  assert.ok(html.includes('katex-mathml'));
  assert.ok(html.includes('aria-hidden="true"'));
});

await test('every style that the renderer writes passes the style rule', () => {
  const html = renderMath(
    '\\begin{aligned} a &= b^2 \\\\ \\frac{c}{d} &= \\sqrt{e_1} \\end{aligned}',
    true,
  );
  const styles = [...html.matchAll(/style="([^"]*)"/g)].map(
    (match) => match[1] ?? '',
  );
  assert.ok(styles.length > 0, 'an aligned block places its rows by style');
  for (const style of styles) assert.ok(isSafeMathStyle(style), style);
});

await test('the style rule refuses what the sanitizer drops', () => {
  assert.equal(isSafeMathStyle('height:0.68em;top:-3.06em'), true);
  assert.equal(isSafeMathStyle('position:relative'), true);
  assert.equal(isSafeMathStyle('color:#cc0000'), true);
  assert.equal(isSafeMathStyle('position:fixed'), false);
  assert.equal(isSafeMathStyle('height:0.68em;inset:0'), false);
  assert.equal(
    isSafeMathStyle('background:url(https://x.invalid/a.png)'),
    false,
  );
  assert.equal(isSafeMathStyle('width:expression(alert(1))'), false);
  assert.equal(isSafeMathStyle(''), false);
  assert.equal(isSafeMathStyle('height'), false);
});
