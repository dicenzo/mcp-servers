import {
  GridConfig,
  GridElement,
  GridLayout,
  Rectangle,
  LayoutError,
  LayoutErrorCode
} from '../types/layout.js';
import { PerformanceMonitor } from './performance.js';
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
      const computedGrid = this.computeElementPositions(config, elements, gridTemplate, monitor);
      
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
  } {
    const columns = this.parseGridTracks(config.columns, bounds.width, 'columns');
    const rows = this.parseGridTracks(config.rows, bounds.height, 'rows');
    
    // Parse grid areas if defined
    const areas = new Map<string, Rectangle>();
    if (config.areas) {
      this.parseGridAreas(config.areas, columns, rows, areas);
    }

    return { columns, rows, areas };
  }

  /**
   * Parse grid track definitions (columns or rows)
   */
  private static parseGridTracks(
    template: string,
    availableSpace: number,
    axis: 'columns' | 'rows'
  ): Array<{ start: number; size: number; name?: string }> {
    const tracks: Array<{ start: number; size: number; name?: string }> = [];
    
    // Handle common patterns
    if (template === 'auto') {
      tracks.push({ start: 0, size: availableSpace });
      return tracks;
    }

    // Parse repeat() functions
    template = this.expandRepeat(template);
    
    // Split template into individual track definitions
    const trackDefs = this.parseTrackDefinitions(template);
    
    // Calculate track sizes
    let currentPosition = 0;
    const frTracks: Array<{ index: number; fr: number }> = [];
    let totalFr = 0;
    let usedSpace = 0;

    // First pass: calculate fixed sizes and collect fr tracks
    trackDefs.forEach((def, index) => {
      const track = { start: currentPosition, size: 0, name: def.name };
      
      if (def.type === 'fixed') {
        track.size = def.value;
        usedSpace += track.size;
        currentPosition += track.size;
      } else if (def.type === 'fr') {
        frTracks.push({ index, fr: def.value });
        totalFr += def.value;
      } else if (def.type === 'auto') {
        // Auto tracks will be sized based on content (simplified to equal distribution)
        track.size = 100; // Default auto size
        usedSpace += track.size;
        currentPosition += track.size;
      } else if (def.type === 'minmax') {
        const minSize = def.min || 0;
        const maxSize = def.max || availableSpace;
        track.size = Math.min(maxSize, Math.max(minSize, 100));
        usedSpace += track.size;
        currentPosition += track.size;
      }
      
      tracks.push(track);
    });

    // Second pass: distribute remaining space to fr tracks
    const remainingSpace = Math.max(0, availableSpace - usedSpace);
    const frUnit = totalFr > 0 ? remainingSpace / totalFr : 0;
    
    const positionAdjustment = 0;
    frTracks.forEach(({ index, fr }) => {
      const track = tracks[index];
      track.size = fr * frUnit;
      track.start = index === 0 ? 0 : tracks[index - 1].start + tracks[index - 1].size + positionAdjustment;
    });

    // Recalculate positions for all tracks
    currentPosition = 0;
    tracks.forEach(track => {
      track.start = currentPosition;
      currentPosition += track.size;
    });

    return tracks;
  }

  /**
   * Expand CSS repeat() functions
   */
  private static expandRepeat(template: string): string {
    return template.replace(/repeat\((\d+),\s*([^)]+)\)/g, (match, count, pattern) => {
      const repeatCount = parseInt(count, 10);
      return Array(repeatCount).fill(pattern.trim()).join(' ');
    });
  }

  /**
   * Parse track definitions from expanded template
   */
  private static parseTrackDefinitions(template: string): Array<{
    type: 'fixed' | 'fr' | 'auto' | 'minmax';
    value: number;
    unit?: string;
    min?: number;
    max?: number;
    name?: string;
  }> {
    const definitions: Array<{
      type: 'fixed' | 'fr' | 'auto' | 'minmax';
      value: number;
      unit?: string;
      min?: number;
      max?: number;
      name?: string;
    }> = [];

    // Split by whitespace, but preserve function calls
    const tokens = template.match(/(\[[\w-]+\]|\w+\([^)]*\)|[\w.-]+)/g) || [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim();
      
      if (token.startsWith('[') && token.endsWith(']')) {
        // Named grid line - attach to next track
        const name = token.slice(1, -1);
        if (i + 1 < tokens.length) {
          const nextDef = { ...this.parseTrackDefinition(tokens[i + 1]), name };
          definitions.push(nextDef);
          i++; // Skip next token since we processed it
        }
      } else {
        definitions.push(this.parseTrackDefinition(token));
      }
    }

    return definitions;
  }

  /**
   * Parse individual track definition
   */
  private static parseTrackDefinition(token: string): {
    type: 'fixed' | 'fr' | 'auto' | 'minmax';
    value: number;
    unit?: string;
    min?: number;
    max?: number;
  } {
    if (token === 'auto') {
      return { type: 'auto', value: 0 };
    }

    if (token.startsWith('minmax(')) {
      const content = token.slice(7, -1);
      const [minStr, maxStr] = content.split(',').map(s => s.trim());
      
      const min = this.parseSingleValue(minStr);
      const max = this.parseSingleValue(maxStr);
      
      return {
        type: 'minmax',
        value: min.value,
        min: min.value,
        max: max.value === Infinity ? undefined : max.value
      };
    }

    const parsed = this.parseSingleValue(token);
    
    if (parsed.unit === 'fr') {
      return { type: 'fr', value: parsed.value };
    } else {
      return { type: 'fixed', value: parsed.value, unit: parsed.unit };
    }
  }

  /**
   * Parse single value with unit
   */
  private static parseSingleValue(value: string): { value: number; unit: string } {
    if (value === 'max-content' || value === 'min-content') {
      return { value: 100, unit: 'px' }; // Simplified
    }
    
    if (value === 'auto') {
      return { value: 0, unit: 'auto' };
    }

    const match = value.match(/^(\d*\.?\d+)(px|fr|%|em|rem|vh|vw|ch|ex)?$/);
    if (match) {
      const numValue = parseFloat(match[1]);
      const unit = match[2] || 'px';
      return { value: numValue, unit };
    }

    // Fallback
    return { value: parseFloat(value) || 0, unit: 'px' };
  }

  /**
   * Parse grid areas from template areas
   */
  private static parseGridAreas(
    areas: string[][],
    columns: Array<{ start: number; size: number }>,
    rows: Array<{ start: number; size: number }>,
    areaMap: Map<string, Rectangle>
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
   * Compute final element positions within the grid
   */
  private static computeElementPositions(
    config: GridConfig,
    elements: GridElement[],
    gridTemplate: {
      columns: Array<{ start: number; size: number }>;
      rows: Array<{ start: number; size: number }>;
      areas: Map<string, Rectangle>;
    },
    monitor?: PerformanceMonitor
  ): {
    tracks: {
      columns: Array<{ start: number; size: number }>;
      rows: Array<{ start: number; size: number }>;
    };
    areas?: Record<string, Rectangle>;
  } {
    // Convert areas map to record for output
    const areas: Record<string, Rectangle> = {};
    gridTemplate.areas.forEach((rect, name) => {
      areas[name] = rect;
    });

    elements.forEach(element => {
      monitor?.recordIteration();
      
      let elementBounds: Rectangle;

      if (element.gridArea && gridTemplate.areas.has(element.gridArea)) {
        // Use predefined grid area
        elementBounds = gridTemplate.areas.get(element.gridArea)!;
      } else {
        // Calculate position from grid line references
        elementBounds = this.calculateElementBounds(element, gridTemplate);
      }

      // Apply alignment
      this.applyElementAlignment(element, elementBounds);
    });

    return {
      tracks: {
        columns: gridTemplate.columns,
        rows: gridTemplate.rows
      },
      areas: Object.keys(areas).length > 0 ? areas : undefined
    };
  }

  /**
   * Calculate element bounds from grid line references
   */
  private static calculateElementBounds(
    element: GridElement,
    gridTemplate: {
      columns: Array<{ start: number; size: number }>;
      rows: Array<{ start: number; size: number }>;
    }
  ): Rectangle {
    // Parse grid line references
    const colStart = this.parseGridLine(element.gridColumnStart, gridTemplate.columns, 'start') || 0;
    const colEnd = this.parseGridLine(element.gridColumnEnd, gridTemplate.columns, 'end') || 1;
    const rowStart = this.parseGridLine(element.gridRowStart, gridTemplate.rows, 'start') || 0;
    const rowEnd = this.parseGridLine(element.gridRowEnd, gridTemplate.rows, 'end') || 1;

    // Calculate bounds
    const startCol = gridTemplate.columns[colStart];
    const endCol = gridTemplate.columns[colEnd - 1];
    const startRow = gridTemplate.rows[rowStart];
    const endRow = gridTemplate.rows[rowEnd - 1];

    if (!startCol || !endCol || !startRow || !endRow) {
      throw new Error(`Invalid grid line references for element ${element.id}`);
    }

    return {
      x: startCol.start,
      y: startRow.start,
      width: endCol.start + endCol.size - startCol.start,
      height: endRow.start + endRow.size - startRow.start
    };
  }

  /**
   * Parse grid line reference (number or name)
   */
  private static parseGridLine(
    line: number | string | undefined,
    tracks: Array<{ start: number; size: number; name?: string }>,
    type: 'start' | 'end'
  ): number | undefined {
    if (line === undefined) {
      return undefined;
    }

    if (typeof line === 'number') {
      return line - 1; // Convert to 0-based index
    }

    if (typeof line === 'string') {
      // Find named line
      const index = tracks.findIndex(track => track.name === line);
      return index >= 0 ? index : undefined;
    }

    return undefined;
  }

  /**
   * Apply element self-alignment within its grid area
   */
  private static applyElementAlignment(element: GridElement, bounds: Rectangle): void {
    // This is a simplified implementation
    // In a full implementation, this would adjust the element's final position
    // based on justifySelf and alignSelf properties
    
    if (element.justifySelf || element.alignSelf) {
      // Alignment logic would go here
      // For now, elements fill their entire grid area
    }
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