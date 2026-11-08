export function isWeeklyDocument(path: string): boolean {
  return /(?:^|\/)\d{4}-W\d{2}\.md$/i.test(path);
}

export function splitFrontmatter(content: string): { prefix: string; body: string } {
  const prefix = content.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/)?.[0] ?? '';
  return { prefix, body: content.slice(prefix.length) };
}

/** node.position lines are relative to the rendered body, not the frontmatter. */
export function toggleWeeklyStar(content: string, line: number): string {
  const { prefix, body } = splitFrontmatter(content);
  const lines = body.split(/(?<=\n)/);
  const index = line - 1;
  const original = lines[index];
  if (!original || !/^ {0,3}#{2,3}[ \t]+\S/.test(original)) throw new Error('주제 제목을 찾을 수 없어요.');
  const ending = original.match(/\r?\n$/)?.[0] ?? '';
  const heading = original.slice(0, original.length - ending.length);
  const starred = /(?:[ \t]*⭐\uFE0F?)+[ \t]*$/.test(heading);
  lines[index] = (starred ? heading.replace(/(?:[ \t]*⭐\uFE0F?)+[ \t]*$/, '') : `${heading} ⭐`) + ending;
  return prefix + lines.join('');
}
