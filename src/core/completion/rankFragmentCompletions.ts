import { extractHeadings } from '../blocks/headingExtractor';
import { extractBlockIds } from '../blocks/blockIdExtractor';

export type FragmentCandidate = {
  label: string;
  insertText: string;
  kind: 'heading' | 'block-id';
  // 1-indexed line number — exposed for human-facing display ("line 12").
  line: number;
};

export function rankFragmentCompletions(targetText: string): FragmentCandidate[] {
  const out: FragmentCandidate[] = [];
  for (const h of extractHeadings(targetText)) {
    out.push({ label: h.text, insertText: h.text, kind: 'heading', line: h.line + 1 });
  }
  for (const [id, info] of extractBlockIds(targetText)) {
    out.push({
      label: `^${id}`,
      insertText: `^${id}`,
      kind: 'block-id',
      line: info.line + 1,
    });
  }
  return out;
}
