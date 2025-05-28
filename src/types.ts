/**
 * Core interfaces and types for the O3 Time Tracker extension
 */

import * as vscode from 'vscode';

/**
 * Represents a single time tracking session
 */
export interface TimeSession {
  /** Unique identifier for the session */
  id: string;
  
  /** Name of the project being tracked */
  projectName: string;
  
  /** Absolute path to the project workspace */
  projectPath: string;
  
  /** Session start timestamp */
  startTime: Date;
  
  /** Session end timestamp (undefined if still active) */
  endTime?: Date;
  
  /** Total active time spent in milliseconds (excluding idle time) */
  totalTime: number;
  
  /** Whether this session is currently active */
  isActive: boolean;
  
  /** Last activity timestamp */
  lastActivity: Date;
  
  /** Timestamp when user was last actively working (for idle calculation) */
  lastActiveTime: Date;
  
  /** Number of text changes during this session */
  textChanges: number;
  
  /** Number of cursor movements during this session */
  cursorMovements: number;
}

/**
 * Statistics for a specific project
 */
export interface ProjectStats {
  /** Project name */
  projectName: string;
  
  /** Absolute path to the project */
  projectPath: string;
  
  /** Total time spent on this project in milliseconds */
  totalTime: number;
  
  /** All sessions for this project */
  sessions: TimeSession[];
  
  /** Last activity on this project */
  lastActivity: Date;
  
  /** Date when tracking started for this project */
  firstSession: Date;
  
  /** Average session duration in milliseconds */
  averageSessionDuration: number;
  
  /** Number of days this project was worked on */
  activeDays: number;
}

/**
 * Overall tracking data structure
 */
export interface TrackingData {
  /** Map of project path to project statistics */
  projects: Map<string, ProjectStats>;
  
  /** Currently active session (if any) */
  currentSession?: TimeSession;
  
  /** Global last activity timestamp */
  lastActivity: Date;
  
  /** Total time tracked across all projects */
  totalTimeTracked: number;
  
  /** Data format version for migration purposes */
  version: string;
  
  /** When this data was last saved */
  lastSaved: Date;
  
  /** Workspace path this data belongs to (for validation) */
  workspacePath?: string;
  
  /** Workspace name this data belongs to (for display) */
  workspaceName?: string;
}

/**
 * Configuration interface for the extension
 */
export interface ExtensionConfig {
  /** Minutes of inactivity before session is considered idle */
  idleThreshold: number;
  
  /** Whether to automatically start tracking when activity is detected */
  autoStart: boolean;
  
  /** Whether to show tracking time in status bar */
  showInStatusBar: boolean;
  
  /** Auto-save interval in seconds */
  saveInterval: number;
  
  /** Whether to track when VS Code is in background */
  trackBackground: boolean;
}

/**
 * Activity state enumeration
 */
export enum ActivityState {
  /** Editor is focused and user is active */
  ACTIVE_FOREGROUND = 'active_foreground',
  
  /** Editor is in background but files are being modified */
  ACTIVE_BACKGROUND = 'active_background',
  
  /** Editor is focused but user is idle (>5 minutes) */
  IDLE_FOREGROUND = 'idle_foreground',
  
  /** Editor is in background and no activity */
  INACTIVE = 'inactive'
}

/**
 * Event data for activity changes
 */
export interface ActivityEvent {
  /** Type of activity that occurred */
  type: 'text_change' | 'cursor_change' | 'window_focus' | 'window_blur';
  
  /** Timestamp of the event */
  timestamp: Date;
  
  /** Document URI if applicable */
  documentUri?: vscode.Uri;
  
  /** Additional event data */
  data?: unknown;
}

/**
 * Status bar states
 */
export enum StatusBarState {
  /** Tracking is active */
  ACTIVE = 'active',
  
  /** Tracking is paused */
  PAUSED = 'paused',
  
  /** User is idle */
  IDLE = 'idle',
  
  /** Tracking is stopped */
  STOPPED = 'stopped',
  
  /** Error state */
  ERROR = 'error'
}

/**
 * Export data format
 */
export interface ExportData {
  /** Export timestamp */
  exportDate: Date;
  
  /** Data format version */
  version: string;
  
  /** Exported projects */
  projects: ProjectStats[];
  
  /** Export options used */
  options: ExportOptions;
}

/**
 * Export configuration options
 */
export interface ExportOptions {
  /** Date range start */
  startDate?: Date;
  
  /** Date range end */
  endDate?: Date;
  
  /** Whether to include individual sessions */
  includeSessions: boolean;
  
  /** Export format */
  format: 'json' | 'csv' | 'html';
  
  /** Whether to include detailed statistics */
  includeStats: boolean;
}

/**
 * Time formatting options
 */
export interface TimeFormatOptions {
  /** Whether to show seconds */
  showSeconds: boolean;
  
  /** Whether to use short format (1h 30m vs 1 hour 30 minutes) */
  shortFormat: boolean;
  
  /** Whether to always show hours even if 0 */
  alwaysShowHours: boolean;
}

/**
 * Utility type for disposable resources
 */
export type DisposableResource = vscode.Disposable;

/**
 * Logger interface
 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Storage interface for persistence
 */
export interface Storage {
  load(): Promise<TrackingData | undefined>;
  save(data: TrackingData): Promise<void>;
  backup(): Promise<void>;
  exists(): Promise<boolean>;
  clear(): Promise<void>;
}

/**
 * Time utilities type definitions
 */
export type TimeFormatter = (milliseconds: number, options?: TimeFormatOptions) => string;
export type DurationCalculator = (start: Date, end?: Date) => number; 