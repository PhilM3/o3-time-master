/**
 * Activity monitor for detecting user activity in VS Code
 */

import * as vscode from 'vscode';
import { ActivityState, ActivityEvent, ExtensionConfig, Logger, DisposableResource } from './types';

/**
 * Monitors user activity in VS Code to determine when to track time
 */
export class ActivityMonitor {
  private lastActivity: Date;
  private isWindowFocused: boolean;
  private readonly subscriptions: DisposableResource[] = [];
  private readonly logger: Logger;
  private readonly config: ExtensionConfig;
  private activityCallbacks: Array<(event: ActivityEvent) => void> = [];
  
  // Sleep/Wake detection
  private lastHeartbeat: Date;
  private heartbeatInterval: NodeJS.Timeout | undefined;
  private readonly HEARTBEAT_INTERVAL = 10000; // 10 seconds
  private readonly SLEEP_THRESHOLD = 30000; // 30 seconds indicates potential sleep

  constructor(logger: Logger, config: ExtensionConfig) {
    this.logger = logger;
    this.config = config;
    this.lastActivity = new Date();
    this.lastHeartbeat = new Date();
    this.isWindowFocused = vscode.window.state.focused;
    
    this.setupEventListeners();
    this.setupSleepWakeDetection();
    this.logger.info('Activity monitor initialized', { 
      windowFocused: this.isWindowFocused,
      idleThreshold: config.idleThreshold 
    });
  }

  /**
   * Get current activity state
   */
  getCurrentState(): ActivityState {
    const idleThresholdMs = this.config.idleThreshold * 60 * 1000; // Convert minutes to milliseconds
    const timeSinceLastActivity = Date.now() - this.lastActivity.getTime();
    const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat.getTime();
    
    // If there's been a significant time gap, consider it as idle regardless of focus
    const hasSleepGap = timeSinceLastHeartbeat > this.SLEEP_THRESHOLD;
    const isIdle = timeSinceLastActivity > idleThresholdMs || hasSleepGap;

    if (this.isWindowFocused) {
      return isIdle ? ActivityState.IDLE_FOREGROUND : ActivityState.ACTIVE_FOREGROUND;
    } else {
      // In background - only active if there was recent activity and background tracking is enabled
      if (this.config.trackBackground && !isIdle && !hasSleepGap) {
        return ActivityState.ACTIVE_BACKGROUND;
      }
      return ActivityState.INACTIVE;
    }
  }

  /**
   * Check if currently active (should track time)
   */
  isActive(): boolean {
    const state = this.getCurrentState();
    return state === ActivityState.ACTIVE_FOREGROUND || state === ActivityState.ACTIVE_BACKGROUND;
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): Date {
    return new Date(this.lastActivity);
  }

  /**
   * Get time since last activity in milliseconds
   */
  getTimeSinceLastActivity(): number {
    return Date.now() - this.lastActivity.getTime();
  }

  /**
   * Reset activity to current time
   */
  resetActivity(): void {
    this.lastActivity = new Date();
    this.logger.debug('Activity reset');
  }

  /**
   * Register callback for activity events
   */
  onActivity(callback: (event: ActivityEvent) => void): void {
    this.activityCallbacks.push(callback);
  }

  /**
   * Update configuration
   */
  updateConfig(config: ExtensionConfig): void {
    const oldThreshold = this.config.idleThreshold;
    Object.assign(this.config, config);
    
    if (oldThreshold !== config.idleThreshold) {
      this.logger.info('Activity monitor config updated', { 
        oldThreshold, 
        newThreshold: config.idleThreshold 
      });
    }
  }

  /**
   * Dispose all event listeners
   */
  dispose(): void {
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    this.subscriptions.forEach(subscription => subscription.dispose());
    this.subscriptions.length = 0;
    this.activityCallbacks.length = 0;
    this.logger.info('Activity monitor disposed');
  }

  /**
   * Setup VS Code event listeners
   */
  private setupEventListeners(): void {
    // Text document changes
    this.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(this.onTextDocumentChange.bind(this))
    );

    // Cursor/selection changes
    this.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection(this.onSelectionChange.bind(this))
    );

    // Active editor changes
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange.bind(this))
    );

    // Terminal activity (optional)
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTerminal(this.onTerminalChange.bind(this))
    );

    this.logger.debug('Activity event listeners setup complete');
  }

  /**
   * Handle text document change events
   */
  private onTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    // Only track changes in workspace files, not settings/output etc.
    if (!this.isWorkspaceFile(event.document.uri)) {
      return;
    }

    // Only track actual content changes, not just saves
    if (event.contentChanges.length === 0) {
      return;
    }

    this.recordActivity({
      type: 'text_change',
      timestamp: new Date(),
      documentUri: event.document.uri,
      data: {
        changeCount: event.contentChanges.length,
        fileName: this.getFileName(event.document.uri)
      }
    });

    this.logger.debug('Text change detected', { 
      fileName: this.getFileName(event.document.uri),
      changes: event.contentChanges.length 
    });
  }

  /**
   * Handle cursor/selection change events
   */
  private onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    if (!this.isWorkspaceFile(event.textEditor.document.uri)) {
      return;
    }

    // Track all cursor changes, including programmatic ones (e.g., from Cursor Agent)
    // This ensures that AI-assisted coding activities are properly tracked
    const isManual = event.kind !== vscode.TextEditorSelectionChangeKind.Command;
    
    this.recordActivity({
      type: 'cursor_change',
      timestamp: new Date(),
      documentUri: event.textEditor.document.uri,
      data: {
        selections: event.selections.length,
        fileName: this.getFileName(event.textEditor.document.uri),
        isManual: isManual,
        kind: event.kind
      }
    });

    this.logger.debug('Cursor change detected', { 
      fileName: this.getFileName(event.textEditor.document.uri),
      selections: event.selections.length,
      isManual: isManual
    });
  }

  /**
   * Handle active editor changes
   */
  private onActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (editor && this.isWorkspaceFile(editor.document.uri)) {
      this.recordActivity({
        type: 'cursor_change',
        timestamp: new Date(),
        documentUri: editor.document.uri,
        data: {
          action: 'editor_switch',
          fileName: this.getFileName(editor.document.uri)
        }
      });

      this.logger.debug('Active editor changed', { 
        fileName: this.getFileName(editor.document.uri) 
      });
    }
  }

  /**
   * Handle terminal changes (additional activity source)
   */
  private onTerminalChange(terminal: vscode.Terminal | undefined): void {
    if (terminal) {
      this.recordActivity({
        type: 'cursor_change',
        timestamp: new Date(),
        data: {
          action: 'terminal_switch',
          terminalName: terminal.name
        }
      });

      this.logger.debug('Terminal changed', { terminalName: terminal.name });
    }
  }

  /**
   * Record activity and notify callbacks
   */
  private recordActivity(event: ActivityEvent): void {
    this.lastActivity = new Date(event.timestamp);
    
    // Notify all registered callbacks
    this.activityCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in activity callback', error as Error);
      }
    });
  }

  /**
   * Check if URI belongs to workspace files
   */
  private isWorkspaceFile(uri: vscode.Uri): boolean {
    // Exclude certain schemes that shouldn't count as activity
    const excludedSchemes = ['output', 'debug', 'extension-output', 'vscode-settings'];
    if (excludedSchemes.includes(uri.scheme)) {
      return false;
    }

    // Include files in workspace folders
    if (vscode.workspace.workspaceFolders) {
      return vscode.workspace.workspaceFolders.some(folder => 
        uri.fsPath.startsWith(folder.uri.fsPath)
      );
    }

    // If no workspace folders, include file:// scheme files
    return uri.scheme === 'file';
  }

  /**
   * Get filename from URI for logging
   */
  private getFileName(uri: vscode.Uri): string {
    return uri.path.split('/').pop() || uri.toString();
  }

  /**
   * Setup sleep/wake detection
   */
  private setupSleepWakeDetection(): void {
    this.heartbeatInterval = setInterval(() => this.checkSleepWake(), this.HEARTBEAT_INTERVAL);
    
    // Setup Page Visibility API for better sleep detection
    this.setupPageVisibilityDetection();
    this.logger.debug('Sleep/wake detection setup complete');
  }

  /**
   * Setup Page Visibility API detection
   */
  private setupPageVisibilityDetection(): void {
    // Note: VS Code extensions run in Node.js context, not browser context
    // So we rely on alternative detection methods like window focus events
    // and time gap detection
    
    // Enhanced window focus detection for sleep/wake scenarios
    this.subscriptions.push(
      vscode.window.onDidChangeWindowState((state) => {
        this.onWindowStateChangeEnhanced(state);
      })
    );
  }

  /**
   * Enhanced window state change handler with sleep/wake detection
   */
  private onWindowStateChangeEnhanced(state: vscode.WindowState): void {
    const wasFocused = this.isWindowFocused;
    this.isWindowFocused = state.focused;
    const now = new Date();

    if (wasFocused !== state.focused) {
      // Check for potential wake event (long gap + focus gained)
      if (state.focused && !wasFocused) {
        const timeSinceLastActivity = now.getTime() - this.lastActivity.getTime();
        const timeSinceLastHeartbeat = now.getTime() - this.lastHeartbeat.getTime();
        
        // If it's been a long time since last activity, treat this as a wake event
        if (timeSinceLastActivity > this.SLEEP_THRESHOLD || timeSinceLastHeartbeat > this.SLEEP_THRESHOLD) {
          this.recordActivity({
            type: 'wake',
            timestamp: now,
            data: { 
              focused: state.focused,
              timeSinceLastActivity: timeSinceLastActivity,
              timeSinceLastHeartbeat: timeSinceLastHeartbeat
            }
          });
          
          this.logger.info('Wake event detected (window focus regained after long period)', {
            timeSinceLastActivity: Math.round(timeSinceLastActivity / 1000),
            timeSinceLastHeartbeat: Math.round(timeSinceLastHeartbeat / 1000)
          });
        }
      }
      
      // Normal window focus/blur event
      this.recordActivity({
        type: state.focused ? 'window_focus' : 'window_blur',
        timestamp: now,
        data: { focused: state.focused }
      });

      this.logger.info('Window focus changed', { focused: state.focused });
    }
  }

  /**
   * Check sleep/wake status with enhanced detection
   */
  private checkSleepWake(): void {
    const now = new Date();
    const timeSinceLastHeartbeat = now.getTime() - this.lastHeartbeat.getTime();
    
    // Detect potential sleep - significant time gap in heartbeat
    if (timeSinceLastHeartbeat > this.SLEEP_THRESHOLD) {
      // First, record the sleep event
      this.recordActivity({
        type: 'sleep',
        timestamp: new Date(this.lastHeartbeat.getTime() + this.HEARTBEAT_INTERVAL),
        data: {
          timeSinceLastHeartbeat: timeSinceLastHeartbeat,
          detectionMethod: 'heartbeat_gap'
        }
      });

      this.logger.info('Sleep detected (heartbeat gap)', {
        timeSinceLastHeartbeat: Math.round(timeSinceLastHeartbeat / 1000),
        lastHeartbeat: this.lastHeartbeat.toISOString()
      });

      // Then record the wake event for the current moment
      this.recordActivity({
        type: 'wake',
        timestamp: now,
        data: {
          timeSinceLastHeartbeat: timeSinceLastHeartbeat,
          detectionMethod: 'heartbeat_resume'
        }
      });

      this.logger.info('Wake detected (heartbeat resumed)', {
        timeSinceLastHeartbeat: Math.round(timeSinceLastHeartbeat / 1000)
      });
    }

    this.lastHeartbeat = now;
  }
} 