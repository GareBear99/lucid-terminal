/**
 * Segmented Display - Warp AI-style Search Result Display
 * 
 * Shows exactly what files/lines are being searched and found:
 * ✓ /path/to/file.ts (123-456)
 * ✓ Grepping for patterns: pattern1, pattern2
 * ✓ Found: def execute_task, Step.*complete
 * 
 * Matches Warp AI's visual feedback format
 */

export interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
  status: 'pending' | 'searching' | 'found' | 'not_found';
  patterns?: string[];
  matchedPatterns?: string[];
}

export interface SearchSegment {
  id: string;
  type: 'file_ref' | 'grep' | 'result' | 'loading';
  content: string;
  status: 'pending' | 'running' | 'success' | 'error';
  files?: FileReference[];
  timestamp: number;
}

export class SegmentedDisplay {
  private segments: SearchSegment[] = [];
  private callbacks: Array<(segments: SearchSegment[]) => void> = [];
  
  /**
   * Subscribe to segment updates
   */
  subscribe(callback: (segments: SearchSegment[]) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }
  
  private _notify(): void {
    for (const callback of this.callbacks) {
      callback([...this.segments]);
    }
  }
  
  /**
   * Add file reference segment
   * Shows: ✓ /path/to/file.ts (123-456)
   */
  addFileReference(
    path: string,
    startLine?: number,
    endLine?: number,
    status: FileReference['status'] = 'pending'
  ): string {
    const lineRange = startLine && endLine ? ` (${startLine}-${endLine})` : '';
    const content = `${path}${lineRange}`;
    
    const segment: SearchSegment = {
      id: this._generateId(),
      type: 'file_ref',
      content,
      status: status === 'found' ? 'success' : status === 'not_found' ? 'error' : 'running',
      files: [{
        path,
        startLine,
        endLine,
        status
      }],
      timestamp: Date.now()
    };
    
    this.segments.push(segment);
    this._notify();
    
    return segment.id;
  }
  
  /**
   * Add grep search segment
   * Shows: Grepping for the following patterns in /path
   *        -pattern1
   *        -pattern2
   */
  addGrepSearch(directory: string, patterns: string[]): string {
    const patternList = patterns.map(p => `  -${p}`).join('\n');
    const content = `Grepping for the following patterns in ${directory}\n${patternList}`;
    
    const segment: SearchSegment = {
      id: this._generateId(),
      type: 'grep',
      content,
      status: 'running',
      timestamp: Date.now()
    };
    
    this.segments.push(segment);
    this._notify();
    
    return segment.id;
  }
  
  /**
   * Update segment status
   */
  updateSegment(id: string, updates: Partial<SearchSegment>): void {
    const segment = this.segments.find(s => s.id === id);
    if (segment) {
      Object.assign(segment, updates);
      this._notify();
    }
  }
  
  /**
   * Add result segment showing what was found
   * Shows: ✓ /path/to/file.ts (123-456)
   *        ✓ Grepping for def execute_task in /path/to/file.py
   */
  addResult(
    path: string,
    patterns: string[],
    matchedPatterns: string[],
    startLine?: number,
    endLine?: number
  ): string {
    const lineRange = startLine && endLine ? ` (${startLine}-${endLine})` : '';
    const matches = matchedPatterns.length > 0 
      ? `\nGrepping for ${matchedPatterns.map(p => `\`${p}\``).join(', ')} in ${path}`
      : '';
    
    const content = `${path}${lineRange}${matches}`;
    
    const segment: SearchSegment = {
      id: this._generateId(),
      type: 'result',
      content,
      status: 'success',
      files: [{
        path,
        startLine,
        endLine,
        status: 'found',
        patterns,
        matchedPatterns
      }],
      timestamp: Date.now()
    };
    
    this.segments.push(segment);
    this._notify();
    
    return segment.id;
  }
  
  /**
   * Add loading indicator
   * Shows: ⏳ Warping... or ⏳ Searching FixNet...
   */
  addLoading(message: string): string {
    const segment: SearchSegment = {
      id: this._generateId(),
      type: 'loading',
      content: message,
      status: 'running',
      timestamp: Date.now()
    };
    
    this.segments.push(segment);
    this._notify();
    
    return segment.id;
  }
  
  /**
   * Remove loading indicator
   */
  removeLoading(id: string): void {
    const index = this.segments.findIndex(s => s.id === id);
    if (index !== -1) {
      this.segments.splice(index, 1);
      this._notify();
    }
  }
  
  /**
   * Get all segments for display
   */
  getSegments(): SearchSegment[] {
    return [...this.segments];
  }
  
  /**
   * Clear all segments
   */
  clear(): void {
    this.segments = [];
    this._notify();
  }
  
  /**
   * Format segments for terminal display
   */
  formatForTerminal(): string {
    const lines: string[] = [];
    
    for (const segment of this.segments) {
      const icon = this._getStatusIcon(segment.status);
      
      switch (segment.type) {
        case 'file_ref':
        case 'result':
          lines.push(`${icon} ${segment.content}`);
          break;
          
        case 'grep':
          lines.push(segment.content);
          break;
          
        case 'loading':
          lines.push(`⏳ ${segment.content}`);
          break;
      }
      
      lines.push(''); // Empty line between segments
    }
    
    return lines.join('\n');
  }
  
  private _getStatusIcon(status: SearchSegment['status']): string {
    switch (status) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'running': return '⏳';
      default: return '○';
    }
  }
  
  private _generateId(): string {
    return `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Example Usage:
 * 
 * const display = new SegmentedDisplay();
 * 
 * // Show file being searched
 * display.addFileReference('/tmp/luciferai-local/core/enhanced_agent.py', 11653, 11852, 'found');
 * 
 * // Show grep patterns
 * const grepId = display.addGrepSearch('/tmp/luciferai-local', [
 *   'print_step\\(',
 *   'def.*execute.*step',
 *   'Step.*complete'
 * ]);
 * 
 * // Update when found
 * display.updateSegment(grepId, { status: 'success' });
 * 
 * // Show results
 * display.addResult(
 *   '/tmp/luciferai-local/core/lucifer_colors.py',
 *   ['print_step'],
 *   ['print_step\\('],
 *   714,
 *   836
 * );
 * 
 * // Show loading
 * const loadId = display.addLoading('Warping...');
 * // Later: display.removeLoading(loadId);
 * 
 * // Get formatted output
 * console.log(display.formatForTerminal());
 */
