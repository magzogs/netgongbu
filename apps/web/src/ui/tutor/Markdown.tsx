import type { ReactElement, ReactNode } from 'react';

/**
 * The little Markdown models write in answers: paragraphs, headings, bullet and numbered lists,
 * code blocks, **bold** and `code`. Built as React elements (never as HTML), so nothing in an
 * answer can run or load anything.
 */

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'code'; text: string };

function blocks(source: string): Block[] {
  const out: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) out.push({ kind: 'p', text: paragraph.join('\n') });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trimStart().startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i += 1; i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```'); i++) {
        code.push(lines[i] ?? '');
      }
      out.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push({ kind: 'h', text: heading[1] ?? '' });
    } else if (bullet ?? numbered) {
      flush();
      const kind = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)?.[1] ?? '';
      const last = out.at(-1);
      if (last?.kind === kind) last.items.push(text);
      else out.push({ kind, items: [text] });
    } else if (line.trim() === '') {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return out;
}

/** **bold** and `code` within a line. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export function Markdown({ text }: { text: string }): ReactElement {
  return (
    <div className="md">
      {blocks(text).map((b, i) => {
        switch (b.kind) {
          case 'h':
            return <h4 key={i}>{inline(b.text)}</h4>;
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ol>
            );
          case 'code':
            return <pre key={i}>{b.text}</pre>;
          default:
            return <p key={i}>{inline(b.text)}</p>;
        }
      })}
    </div>
  );
}
