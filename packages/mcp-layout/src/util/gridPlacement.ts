import { GridElement, MAX_GRID_TRACKS } from '../types/layout.js';

/**
 * CSS grid item placement on cell indices (0-based): explicit line numbers, named
 * lines, `span`, named areas, then auto-placement of everything else in the
 * `grid-auto-flow` direction, adding implicit tracks when the explicit grid is full.
 */

export interface CellPlacement {
  id: string;
  column: number;
  columnSpan: number;
  row: number;
  rowSpan: number;
}

export interface AreaCells {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

interface AxisPlacement {
  /** 0-based start track, or undefined when the item is auto-placed on this axis */
  start?: number;
  span: number;
}

type LineValue = number | string | undefined;

/** One side of `grid-column`/`grid-row`: a line number, a line name or `span n` */
type LineRef = { line: number } | { name: string } | { span: number } | undefined;

function parseLineRef(value: LineValue): LineRef {
  if (value === undefined || value === 'auto' || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return { line: value };
  }
  const text = value.trim();
  const span = text.match(/^span\s+(\d+)$/);
  if (span) {
    return { span: Math.max(1, parseInt(span[1], 10)) };
  }
  if (/^-?\d+$/.test(text)) {
    return { line: parseInt(text, 10) };
  }
  return { name: text };
}

/** Splits `grid-column: 1 / 3` into its start and end values */
function splitShorthand(value: string | undefined): [LineValue, LineValue] {
  if (value === undefined) {
    return [undefined, undefined];
  }
  const [start, end] = value.split('/').map(part => part.trim());
  return [start, end];
}

/**
 * Resolves one axis to a start track and span. Positive lines count from 1, negative
 * lines from the end of the explicit grid (-1 is the last line), and a name refers
 * to the track with that line name.
 */
function resolveAxis(
  startValue: LineValue,
  endValue: LineValue,
  trackCount: number,
  trackNames: Array<string | undefined>
): AxisPlacement {
  const toIndex = (ref: LineRef): number | undefined => {
    if (!ref || 'span' in ref) {
      return undefined;
    }
    if ('name' in ref) {
      const index = trackNames.indexOf(ref.name);
      return index >= 0 ? index : undefined;
    }
    return ref.line > 0 ? ref.line - 1 : trackCount + 1 + ref.line;
  };

  const startRef = parseLineRef(startValue);
  const endRef = parseLineRef(endValue);
  const start = toIndex(startRef);
  const end = toIndex(endRef);
  const span = (startRef && 'span' in startRef ? startRef.span : undefined)
    ?? (endRef && 'span' in endRef ? endRef.span : undefined);

  if (start !== undefined && end !== undefined) {
    // Lines given in either order cover the tracks between them
    return { start: Math.max(0, Math.min(start, end)), span: Math.max(1, Math.abs(end - start)) };
  }
  if (start !== undefined) {
    return { start: Math.max(0, start), span: span ?? 1 };
  }
  if (end !== undefined) {
    const length = span ?? 1;
    return { start: Math.max(0, end - length), span: length };
  }
  return { span: span ?? 1 };
}

/**
 * Places every element and returns the cells it covers plus the final number of
 * columns and rows (explicit plus implicit). `dense` packing is treated as sparse.
 */
export function placeGridItems(
  elements: GridElement[],
  explicitColumns: Array<{ name?: string }>,
  explicitRows: Array<{ name?: string }>,
  areaCells: Map<string, AreaCells>,
  autoFlow: string
): { placements: CellPlacement[]; columnCount: number; rowCount: number } {
  const columnNames = explicitColumns.map(track => track.name);
  const rowNames = explicitRows.map(track => track.name);
  const byColumn = autoFlow.startsWith('column');

  const items = elements.map(element => {
    const area = element.gridArea ? areaCells.get(element.gridArea) : undefined;
    if (area) {
      return {
        id: element.id,
        column: { start: area.minCol, span: area.maxCol - area.minCol + 1 } as AxisPlacement,
        row: { start: area.minRow, span: area.maxRow - area.minRow + 1 } as AxisPlacement
      };
    }
    const [columnStart, columnEnd] = splitShorthand(element.gridColumn);
    const [rowStart, rowEnd] = splitShorthand(element.gridRow);
    return {
      id: element.id,
      column: resolveAxis(element.gridColumnStart ?? columnStart, element.gridColumnEnd ?? columnEnd,
        explicitColumns.length, columnNames),
      row: resolveAxis(element.gridRowStart ?? rowStart, element.gridRowEnd ?? rowEnd,
        explicitRows.length, rowNames)
    };
  });

  let columnCount = Math.max(1, explicitColumns.length);
  let rowCount = Math.max(1, explicitRows.length);
  const occupied = new Set<string>();
  const fits = (column: number, row: number, columnSpan: number, rowSpan: number) => {
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = column; c < column + columnSpan; c++) {
        if (occupied.has(`${c},${r}`)) {
          return false;
        }
      }
    }
    return true;
  };
  const placements = new Map<string, CellPlacement>();
  const place = (id: string, column: number, row: number, columnSpan: number, rowSpan: number) => {
    if (column + columnSpan > MAX_GRID_TRACKS || row + rowSpan > MAX_GRID_TRACKS) {
      throw new Error(`Grid placement of ${id} needs more than ${MAX_GRID_TRACKS} tracks`);
    }
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = column; c < column + columnSpan; c++) {
        occupied.add(`${c},${r}`);
      }
    }
    columnCount = Math.max(columnCount, column + columnSpan);
    rowCount = Math.max(rowCount, row + rowSpan);
    placements.set(id, { id, column, columnSpan, row, rowSpan });
  };

  // 1. Items fixed on both axes
  for (const item of items) {
    if (item.column.start !== undefined && item.row.start !== undefined) {
      place(item.id, item.column.start, item.row.start, item.column.span, item.row.span);
    }
  }

  // 2. Items fixed on the flow's cross axis (a row for row flow), first free slot along it
  for (const item of items) {
    const locked = byColumn ? item.column : item.row;
    if (placements.has(item.id) || locked.start === undefined) {
      continue;
    }
    let position = 0;
    while (byColumn
      ? !fits(locked.start, position, item.column.span, item.row.span)
      : !fits(position, locked.start, item.column.span, item.row.span)) {
      position++;
    }
    if (byColumn) {
      place(item.id, locked.start, position, item.column.span, item.row.span);
    } else {
      place(item.id, position, locked.start, item.column.span, item.row.span);
    }
  }

  // 3. Everything else, with a cursor that moves forward in flow order (sparse packing).
  // The tracks along the flow are fixed; new tracks are added across it.
  let cursorMajor = 0;
  let cursorMinor = 0;
  for (const item of items) {
    if (placements.has(item.id)) {
      continue;
    }
    const minorSpan = byColumn ? item.row.span : item.column.span;
    const majorSpan = byColumn ? item.column.span : item.row.span;
    const fixedMinor = byColumn ? item.row.start : item.column.start;
    const minorTracks = Math.max(byColumn ? rowCount : columnCount, (fixedMinor ?? 0) + minorSpan);

    for (;;) {
      const minor = fixedMinor ?? cursorMinor;
      if (fixedMinor !== undefined && fixedMinor < cursorMinor) {
        // The fixed track is behind the cursor on this line; move to the next line
        cursorMajor++;
        cursorMinor = 0;
        continue;
      }
      if (minor + minorSpan > minorTracks) {
        cursorMajor++;
        cursorMinor = 0;
        continue;
      }
      const column = byColumn ? cursorMajor : minor;
      const row = byColumn ? minor : cursorMajor;
      if (fits(column, row, item.column.span, item.row.span)) {
        place(item.id, column, row, item.column.span, item.row.span);
        cursorMinor = minor + minorSpan;
        break;
      }
      cursorMinor = minor + 1;
      if (cursorMajor + majorSpan > MAX_GRID_TRACKS) {
        throw new Error(`Grid placement of ${item.id} needs more than ${MAX_GRID_TRACKS} tracks`);
      }
    }
  }

  return { placements: elements.map(e => placements.get(e.id)!), columnCount, rowCount };
}
