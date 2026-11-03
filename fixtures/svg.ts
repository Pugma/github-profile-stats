import assert from "node:assert/strict";

export function svgElements(svg: string, tag: string) {
  return [...svg.matchAll(new RegExp(`<${tag}\\b([^>]*)>([^<]*)`, "g"))].map((match) => ({
    attributes: Object.fromEntries(
      [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attribute) => [
        attribute[1],
        attribute[2],
      ]),
    ),
    text: match[2],
    index: match.index,
  }));
}

export function svgText(svg: string, text: string) {
  const element = svgElements(svg, "text").find((element) => element.text === text);
  assert.ok(element, `Missing SVG text: ${text}`);
  return element;
}

// Scope assertions to the nearest group enclosing a label or accessible row title.
export function svgGroup(svg: string, element: { index: number }) {
  const starts: number[] = [];
  for (const match of svg.matchAll(/<\/?g\b[^>]*>/g)) {
    if (match.index > element.index) break;
    if (match[0].startsWith("</")) starts.pop();
    else starts.push(match.index);
  }
  const start = starts.at(-1);
  assert.ok(start !== undefined, "Missing enclosing SVG group");
  let depth = 0;
  for (const match of svg.slice(start).matchAll(/<\/?g\b[^>]*>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return svg.slice(start, start + match.index + match[0].length);
  }
  assert.fail("Unclosed SVG group");
}
