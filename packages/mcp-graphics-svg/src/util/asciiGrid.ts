/** Tab stops every 8 columns, as terminals and `expand` use */
export const TAB_WIDTH = 8;

/**
 * Splits ASCII-art text into rows of single-character cells, for the text-diagram tools.
 *
 * - CRLF, CR and LF all end a line, so a `\r` never becomes a column.
 * - Tabs expand to spaces up to the next tab stop, so tab-indented art lines up.
 * - Cells are code points, not UTF-16 code units, so an emoji is one cell rather
 *   than two broken halves.
 */
export function toCharGrid(text: string): string[][] {
  return text.split(/\r\n|\r|\n/).map(line => {
    const cells: string[] = [];
    for (const char of line) {
      if (char === '\t') {
        do cells.push(' '); while (cells.length % TAB_WIDTH !== 0);
      } else {
        cells.push(char);
      }
    }
    return cells;
  });
}
