import * as assert from 'assert';

import MarkdownIt from 'markdown-it';

import { embedPlugin, ResolveFn } from '../../src/markdownItPlugin/embedRule';

const fakeResolve: ResolveFn = (target) => {
  if (target === 'note')
    return { kind: 'markdown', text: '# Note\n\nNote body.', sourcePath: '/abs/note.md' };
  if (target === 'note#Section')
    return { kind: 'markdown', text: '## Section\nSection body.', sourcePath: '/abs/note.md' };
  if (target === 'diagram.png') return { kind: 'image', src: 'file:///fake/diagram.png' };
  return null;
};

suite('embedPlugin', () => {
  test('embeds full markdown file', () => {
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve: fakeResolve });
    const out = md.render('before\n\n![[note]]\n\nafter');
    assert.ok(out.includes('Note body.'));
  });
  test('embeds heading section', () => {
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve: fakeResolve });
    assert.ok(md.render('![[note#Section]]').includes('Section body.'));
  });
  test('image embed produces img tag', () => {
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve: fakeResolve });
    const out = md.render('![[diagram.png]]');
    assert.ok(/<img\s[^>]*src="file:\/\/\/fake\/diagram\.png"/.test(out));
  });
  test('image with size hint adds width attribute', () => {
    const md = new MarkdownIt({ html: true }).use(embedPlugin, {
      resolve: (t: string) => fakeResolve(t.replace(/\|.*/, '')),
    });
    const out = md.render('![[diagram.png|300]]');
    assert.ok(/width="300"/.test(out));
  });
  test('unresolved embed leaves a placeholder, no crash', () => {
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve: () => null });
    const out = md.render('![[ghost]]');
    assert.ok(out.includes('ghost'));
  });

  test('ancestor cycle (a -> b -> a) stops without exhausting depth cap', () => {
    const resolve: ResolveFn = (target) => {
      if (target === 'a')
        return { kind: 'markdown', text: 'A body. ![[b]]', sourcePath: '/abs/a.md' };
      if (target === 'b')
        return { kind: 'markdown', text: 'B body. ![[a]]', sourcePath: '/abs/b.md' };
      return null;
    };
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve, maxDepth: 10 });
    const out = md.render('Start. ![[a]] End.');
    assert.ok(out.includes('A body.'));
    assert.ok(out.includes('B body.'));
    assert.ok(/Cyclic embed/i.test(out), 'expected cycle marker when a re-appears as ancestor');
  });

  test('depth cap stops recursion at the configured limit', () => {
    const resolve: ResolveFn = (target) => {
      const next = String.fromCharCode(target.charCodeAt(0) + 1);
      return {
        kind: 'markdown',
        text: `level-${target}. ![[${next}]]`,
        sourcePath: `/abs/${target}.md`,
      };
    };
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve, maxDepth: 2 });
    const out = md.render('![[a]]');
    assert.ok(/Embed depth exceeded/i.test(out), `expected depth marker, got: ${out}`);
  });

  test('longer cycle (a -> b -> c -> a) is caught', () => {
    const resolve: ResolveFn = (target) => {
      const next = ({ a: 'b', b: 'c', c: 'a' } as Record<string, string>)[target];
      if (!next) return null;
      return {
        kind: 'markdown',
        text: `${target}-body. ![[${next}]]`,
        sourcePath: `/abs/${target}.md`,
      };
    };
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve, maxDepth: 10 });
    const out = md.render('![[a]]');
    assert.ok(out.includes('a-body.') && out.includes('b-body.') && out.includes('c-body.'));
    assert.ok(/Cyclic embed/i.test(out));
  });

  test('the same target appearing as siblings (not ancestors) both expand', () => {
    const resolve: ResolveFn = (target) =>
      target === 'leaf'
        ? { kind: 'markdown', text: 'leaf-body', sourcePath: '/abs/leaf.md' }
        : null;
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve, maxDepth: 5 });
    const out = md.render('![[leaf]] and ![[leaf]]');
    const count = (out.match(/leaf-body/g) ?? []).length;
    assert.strictEqual(count, 2, 'sibling occurrences are not a cycle');
  });

  test('image target with quote and angle brackets is HTML-attribute-escaped', () => {
    const resolve: ResolveFn = () => ({ kind: 'image', src: 'file:///x.png' });
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve });
    const out = md.render('![[evil".png]]');
    assert.ok(!out.includes('alt="evil".png'), 'raw quote must not appear inside attribute');
    assert.ok(
      out.includes('&quot;') || out.includes('&#34;'),
      `expected escaped quote, got: ${out}`,
    );
  });

  test('unresolved-embed placeholder escapes markdown metachars in the target', () => {
    const md = new MarkdownIt({ html: true }).use(embedPlugin, { resolve: () => null });
    const out = md.render('![[***mean***]]');
    assert.ok(!/<strong>.*mean.*<\/strong>/.test(out), `markdown injection not escaped: ${out}`);
  });
});
