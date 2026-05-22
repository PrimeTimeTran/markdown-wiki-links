import * as assert from 'assert';

import MarkdownIt from 'markdown-it';

import { wikiPlugin, WikiResolver } from '../../src/markdownItPlugin/wikiRule';

// A resolver where embeds resolve a small fixed set and links resolve to "<target>.md".
function resolver(over: Partial<WikiResolver> = {}): WikiResolver {
  return {
    resolveEmbed: (_from, key) => {
      if (key === 'note')
        return { kind: 'markdown', text: '# Note\n\nNote body.', sourcePath: '/abs/note.md' };
      if (key === 'note#Section')
        return {
          kind: 'markdown',
          text: '## Section\nSection body.',
          sourcePath: '/abs/note.md',
        };
      if (key === 'diagram.png') return { kind: 'image', src: 'media/diagram.png' };
      return null;
    },
    resolveLink: (_from, target) => (target === 'ghost' ? null : `${target}.md`),
    ...over,
  };
}

function mk(
  res: WikiResolver,
  opts: { maxDepth?: number; getDocumentPath?: () => string | undefined } = {},
): MarkdownIt {
  return new MarkdownIt({ html: true }).use(wikiPlugin, { resolver: res, ...opts });
}

suite('wikiPlugin — embeds', () => {
  test('embeds full markdown file', () => {
    assert.ok(mk(resolver()).render('before\n\n![[note]]\n\nafter').includes('Note body.'));
  });
  test('embeds heading section', () => {
    assert.ok(mk(resolver()).render('![[note#Section]]').includes('Section body.'));
  });
  test('image embed produces an image referencing the resolved src', () => {
    const out = mk(resolver()).render('![[diagram.png]]');
    assert.ok(/<img\s[^>]*src="media\/diagram\.png"/.test(out), `got: ${out}`);
  });
  test('image embed with a width hint renders the image at that width', () => {
    const res = resolver({
      resolveEmbed: (_f, key) =>
        key.startsWith('diagram.png') ? { kind: 'image', src: 'media/diagram.png' } : null,
    });
    const out = mk(res).render('![[diagram.png|300]]');
    assert.ok(/<img\s[^>]*src="media\/diagram\.png"/.test(out), `got: ${out}`);
    assert.ok(/width="300"/.test(out), `expected width attribute, got: ${out}`);
    assert.ok(!out.includes('wl-size'), `size title must be stripped, got: ${out}`);
  });
  test('image embed with a width x height hint sets both dimensions', () => {
    const res = resolver({
      resolveEmbed: (_f, key) =>
        key.startsWith('diagram.png') ? { kind: 'image', src: 'media/diagram.png' } : null,
    });
    const out = mk(res).render('![[diagram.png|300x150]]');
    assert.ok(/width="300"/.test(out) && /height="150"/.test(out), `got: ${out}`);
  });
  test('unresolved embed leaves a placeholder, no crash', () => {
    const res = resolver({ resolveEmbed: () => null });
    assert.ok(mk(res).render('![[ghost]]').includes('ghost'));
  });
  test('depth cap stops recursion at the configured limit', () => {
    const res: WikiResolver = {
      resolveEmbed: (_f, key) => {
        const next = String.fromCharCode(key.charCodeAt(0) + 1);
        return {
          kind: 'markdown',
          text: `level-${key}. ![[${next}]]`,
          sourcePath: `/abs/${key}.md`,
        };
      },
      resolveLink: () => null,
    };
    assert.ok(/Embed depth exceeded/i.test(mk(res, { maxDepth: 2 }).render('![[a]]')));
  });
  test('ancestor cycle (a -> b -> a) is caught', () => {
    const res: WikiResolver = {
      resolveEmbed: (_f, key) => {
        if (key === 'a')
          return { kind: 'markdown', text: 'A body. ![[b]]', sourcePath: '/abs/a.md' };
        if (key === 'b')
          return { kind: 'markdown', text: 'B body. ![[a]]', sourcePath: '/abs/b.md' };
        return null;
      },
      resolveLink: () => null,
    };
    const out = mk(res, { maxDepth: 10 }).render('![[a]]');
    assert.ok(out.includes('A body.') && out.includes('B body.'));
    assert.ok(/Cyclic embed/i.test(out));
  });
  test('a file that embeds itself is caught at the first reference', () => {
    const res: WikiResolver = {
      resolveEmbed: (_f, key) =>
        key === 'self'
          ? { kind: 'markdown', text: 'Self body. ![[self]]', sourcePath: '/abs/self.md' }
          : null,
      resolveLink: () => null,
    };
    const out = mk(res, { maxDepth: 10, getDocumentPath: () => '/abs/self.md' }).render(
      'Doc body. ![[self]]',
    );
    assert.ok(/Cyclic embed/i.test(out), `expected cyclic marker, got: ${out}`);
    assert.ok(!out.includes('Self body.'), `self content must not expand even once, got: ${out}`);
  });
  test('image target with quote is HTML-attribute-escaped', () => {
    const res = resolver({ resolveEmbed: () => ({ kind: 'image', src: 'x.png' }) });
    const out = mk(res).render('![[evil".png]]');
    assert.ok(out.includes('&quot;'), `expected escaped quote, got: ${out}`);
  });
});

suite('wikiPlugin — links', () => {
  test('plain [[foo]] becomes a navigable link', () => {
    const out = mk(resolver()).render('see [[foo]] here');
    assert.ok(/<a [^>]*href="foo\.md"[^>]*>foo<\/a>/.test(out), `got: ${out}`);
  });
  test('[[foo|Display]] uses the display text as the link label', () => {
    const out = mk(resolver()).render('[[foo|Display]]');
    assert.ok(/>Display<\/a>/.test(out), `got: ${out}`);
    assert.ok(out.includes('href="foo.md"'));
  });
  test('unresolved [[ghost]] renders as plain text, not a link', () => {
    const out = mk(resolver()).render('[[ghost]]');
    assert.ok(out.includes('ghost'));
    assert.ok(!/<a /.test(out), `should not be a link: ${out}`);
  });
  test('embeds are not also rewritten as links', () => {
    const out = mk(resolver()).render('![[note]]');
    assert.ok(out.includes('Note body.'));
    assert.ok(!out.includes('[[note]]'));
  });
  test('wiki-links inside YAML frontmatter are left verbatim', () => {
    const src = '---\ncover: "[[my_image.svg]]"\n---\n\nBody [[foo]].';
    const out = mk(resolver()).render(src);
    assert.ok(out.includes('[[my_image.svg]]'), `frontmatter must stay verbatim, got: ${out}`);
    assert.ok(/<a [^>]*href="foo\.md"/.test(out), `body link should be rewritten, got: ${out}`);
  });
  test('links inside embedded content are also rewritten', () => {
    const res: WikiResolver = {
      resolveEmbed: (_f, key) =>
        key === 'note'
          ? { kind: 'markdown', text: 'Note links to [[other]].', sourcePath: '/abs/note.md' }
          : null,
      resolveLink: (_f, target) => `${target}.md`,
    };
    const out = mk(res).render('![[note]]');
    assert.ok(/<a [^>]*href="other\.md"/.test(out), `got: ${out}`);
  });
});
