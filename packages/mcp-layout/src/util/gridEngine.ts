import {
  GridConfig,
  GridElement,
  GridLayout,
  Rectangle,
} from '../types/layout.js';
import { PerformanceMonitor } from './performance.js';
import { AreaCells, placeGridItems } from './gridPlacement.js';
import { expandTracks, parseTrackList, resolveGaps, sizeTracks, CONTENT_TRACK_SIZE } from './gridTracks.js';
import { LayoutValidator } from './validation.js';

/**
 * CSS Grid layout computation engine
 */
export class GridEngine {
  
  /**
   * Create a CSS Grid layout with computed positions
   */
  static createLayout(
    config: GridConfig,
    elements: GridElement[],
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): GridLayout {
    monitor?.start('grid-layout-creation');
    
    try {
      // Validate configuration
      const configErrors = LayoutValidator.validateGridConfig(config);
      const elementErrors = LayoutValidator.validateGridElements(elements, config);
      
      if (configErrors.length > 0 || elementErrors.length > 0) {
        throw new Error(`Grid validation failed: ${[...configErrors, ...elementErrors].map(e => e.message).join(', ')}`);
      }

      // Parse grid template
      const gridTemplate = this.parseGridTemplate(config, bounds);
      monitor?.recordIteration();

      // Assign elements to grid areas and positions
      const computedGrid = this.computeElementPositions(config, elements, gridTemplate, bounds, monitor);
      
      const layout: GridLayout = {
        type: 'grid',
        config,
        elements,
        bounds,
        computedGrid
      };

      return layout;
      
    } finally {
      monitor?.recordIteration();
    }
  }

  /**
   * Parse CSS grid template into computed tracks
   */
  private static parseGridTemplate(config: GridConfig, bounds: Rectangle): {
    columns: Array<{ start: number; size: number; name?: string }>;
    rows: Array<{ start: number; size: number; name?: string }>;
    areas: Map<string, Rectangle>;
    areaCells: Map<string, AreaCells>;
    gaps: { row: number; column: number };
  } {
    const gaps = resolveGaps(config, bounds.width, bounds.height);
    const columns = sizeTracks(expandTracks(parseTrackList(config.columns, 'grid-template-columns'), bounds.width, gaps.column), bounds.width, gaps.column);
    const rows = sizeTracks(expandTracks(parseTrackList(config.rows, 'grid-template-rows'), bounds.height, gaps.row), bounds.height, gaps.row);
    
    // Parse grid areas if defined
    const areas = new Map<string, Rectangle>();
    const areaCells = new Map<string, AreaCells>();
    if (config.areas) {
      this.parseGridAreas(config.areas, columns, rows, areas, areaCells);
    }

    return { columns, rows, areas, areaCells, gaps };
  }

  /**
   * Parse grid areas from template areas
   */
  private static parseGridAreas(
    areas: string[][],
    columns: Array<{ start: number; size: number }>,
    rows: Array<{ start: number; size: number }>,
    areaMap: Map<string, Rectangle>,
    areaCells: Map<string, AreaCells>
  ): void {
    const areaPositions = new Map<string, {
      minRow: number; maxRow: number; minCol: number; maxCol: number;
    }>();

    // Find area boundaries
    areas.forEach((row, rowIndex) => {
      row.forEach((area, colIndex) => {
        if (area !== '.') {
          if (!areaPositions.has(area)) {
            areaPositions.set(area, {
              minRow: rowIndex, maxRow: rowIndex,
              minCol: colIndex, maxCol: colIndex
            });
          } else {
            const pos = areaPositions.get(area)!;
            pos.minRow = Math.min(pos.minRow, rowIndex);
            pos.maxRow = Math.max(pos.maxRow, rowIndex);
            pos.minCol = Math.min(pos.minCol, colIndex);
            pos.maxCol = Math.max(pos.maxCol, colIndex);
          }
        }
      });
    });

    // Convert to rectangles
    areaPositions.forEach((pos, areaName) => {
      areaCells.set(areaName, pos);
      const startColumn = columns[pos.minCol];
      const endColumn = columns[pos.maxCol];
      const startRow = rows[pos.minRow];
      const endRow = rows[pos.maxRow];

      if (startColumn && endColumn && startRow && endRow) {
        areaMap.set(areaName, {
          x: startColumn.start,
          y: startRow.start,
          width: endColumn.start + endColumn.size - startColumn.start,
          height: endRow.start + endRow.size - startRow.start
        });
      }
    });
  }

  /**
   * Places the elements (explicitly or by auto-placement), adds any implicit tracks,
   * and returns each element's absolute bounds. Tracks and areas stay relative to
   * the container, as before.
   */
  private static computeElementPositions(
    config: GridConfig,
    elements: GridElement[],
    gridTemplate: {
      columns: Array<{ start: number; size: number; name?: string }>;
      rows: Array<{ start: number; size: number; name?: string }>;
      areas: Map<string, Rectangle>;
      areaCells: Map<string, AreaCells>;
      gaps: { row: number; column: number };
    },
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): NonNullable<GridLayout['computedGrid']> {
    // Convert areas map to record for output
    const areas: Record<string, Rectangle> = {};
    gridTemplate.areas.forEach((rect, name) => {
      areas[name] = rect;
    });

    const { placements, columnCount, rowCount } = placeGridItems(
      elements, gridTemplate.columns, gridTemplate.rows, gridTemplate.areaCells, config.autoFlow
    );
    const columns = this.withImplicitTracks(gridTemplate.columns, columnCount, config.autoColumns, gridTemplate.gaps.column, bounds.width);
    const rows = this.withImplicitTracks(gridTemplate.rows, rowCount, config.autoRows, gridTemplate.gaps.row, bounds.height);

    const elementPositions = placements.map(placement => {
      monitor?.recordIteration();
      const first = { column: columns[placement.column], row: rows[placement.row] };
      const last = {
        column: columns[placement.column + placement.columnSpan - 1],
        row: rows[placement.row + placement.rowSpan - 1]
      };
      return {
        id: placement.id,
        bounds: {
          x: bounds.x + first.column.start,
          y: bounds.y + first.row.start,
          width: last.column.start + last.column.size - first.column.start,
          height: last.row.start + last.row.size - first.row.start
        }
      };
    });

    return {
      tracks: {
        columns: columns.map(({ start, size }) => ({ start, size })),
        rows: rows.map(({ start, size }) => ({ start, size }))
      },
      areas: Object.keys(areas).length > 0 ? areas : undefined,
      elementPositions
    };
  }

  /**
   * Extends the explicit tracks to `count` with implicit ones sized by
   * grid-auto-rows / grid-auto-columns (cycled), separated by the gap. Content-sized
   * values use the 100px estimate.
   */
  private static withImplicitTracks(
    tracks: Array<{ start: number; size: number; name?: string }>,
    count: number,
    autoTemplate: string | undefined,
    gap: number,
    available: number
  ): Array<{ start: number; size: number; name?: string }> {
    const result = tracks.map(track => ({ ...track }));
    if (count <= result.length) {
      return result;
    }
    const autoSizes = autoTemplate
      ? sizeTracks(expandTracks(parseTrackList(autoTemplate), available, 0), 0, 0)
        .map(track => track.size || CONTENT_TRACK_SIZE)
      : [CONTENT_TRACK_SIZE];
    for (let i = result.length; i < count; i++) {
      const previous = result[i - 1];
      const size = autoSizes[(i - tracks.length) % autoSizes.length];
      result.push({ start: previous ? previous.start + previous.size + gap : 0, size });
    }
    return result;
  }

  /**
   * Calculate grid layout metrics
   */
  static calculateMetrics(layout: GridLayout): {
    totalTracks: number;
    usedAreas: number;
    elementOverlaps: string[];
    emptyAreas: number;
  } {
    const totalTracks = (layout.computedGrid?.tracks.columns.length || 0) + 
                       (layout.computedGrid?.tracks.rows.length || 0);
    
    const usedAreas = Object.keys(layout.computedGrid?.areas || {}).length;
    
    // Simple overlap detection (would be more sophisticated in practice)
    const elementOverlaps: string[] = [];
    
    const emptyAreas = Math.max(0, totalTracks - layout.elements.length);
    
    return {
      totalTracks,
      usedAreas,
      elementOverlaps,
      emptyAreas
    };
  }

  /**
   * Optimize grid layout for better performance
   */
  static optimizeLayout(layout: GridLayout): GridLayout {
    // Create a copy for optimization
    const optimized = JSON.parse(JSON.stringify(layout));
    
    // Remove unused grid areas
    if (optimized.computedGrid?.areas) {
      const usedAreas = new Set(layout.elements.map(e => e.gridArea).filter(Boolean));
      
      Object.keys(optimized.computedGrid.areas).forEach(areaName => {
        if (!usedAreas.has(areaName)) {
          delete optimized.computedGrid.areas![areaName];
        }
      });
    }

    return optimized;
  }
}