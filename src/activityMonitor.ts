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

  constructor(logger: Logger, config: ExtensionConfig) {
    this.logger = logger;
    this.config = config;
    this.lastActivity = new Date();
    this.isWindowFocused = vscode.window.state.focused;
    
    this.setupEventListeners();
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
    const isIdle = timeSinceLastActivity > idleThresholdMs;

    if (this.isWindowFocused) {
      return isIdle ? ActivityState.IDLE_FOREGROUND : ActivityState.ACTIVE_FOREGROUND;
    } else {
      // In background - only active if there was recent activity and background tracking is enabled
      if (this.config.trackBackground && !isIdle) {
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

    // Window focus changes
    this.subscriptions.push(
      vscode.window.onDidChangeWindowState(this.onWindowStateChange.bind(this))
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
   * Handle window state changes (focus/blur)
   */
  private onWindowStateChange(state: vscode.WindowState): void {
    const wasFocused = this.isWindowFocused;
    this.isWindowFocused = state.focused;

    if (wasFocused !== state.focused) {
      this.recordActivity({
        type: state.focused ? 'window_focus' : 'window_blur',
        timestamp: new Date(),
        data: { focused: state.focused }
      });

      this.logger.info('Window focus changed', { focused: state.focused });
    }
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
} 