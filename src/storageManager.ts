/**
 * Storage manager for persisting time tracking data
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TrackingData, ProjectStats, Storage, Logger } from './types';

/**
 * File-based storage implementation for tracking data
 */
export class FileStorageManager implements Storage {
  private readonly dataPath: string;
  private readonly backupPath: string;
  private readonly logger: Logger;
  private readonly DATA_VERSION = '1.0.0';

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.logger = logger;
    
    // Use workspace-specific storage instead of global storage
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    let storageDir: string;
    
    if (workspaceFolder) {
      // Store data in workspace-specific directory
      const workspaceHash = this.generateWorkspaceHash(workspaceFolder.uri.fsPath);
      storageDir = path.join(context.globalStorageUri.fsPath, 'workspaces', workspaceHash);
    } else {
      // Fallback to global storage for files without workspace
      storageDir = path.join(context.globalStorageUri.fsPath, 'global');
    }
    
    this.dataPath = path.join(storageDir, 'timeTrackingData.json');
    this.backupPath = path.join(storageDir, 'timeTrackingData.backup.json');
    
    this.logger.debug('Storage paths initialized', { 
      dataPath: this.dataPath, 
      backupPath: this.backupPath,
      workspace: workspaceFolder?.name || 'global'
    });
  }

  /**
   * Generate a hash for workspace path to create unique storage directories
   */
  private generateWorkspaceHash(workspacePath: string): string {
    // Simple hash function for workspace path
    let hash = 0;
    for (let i = 0; i < workspacePath.length; i++) {
      const char = workspacePath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Load tracking data from storage
   */
  async load(): Promise<TrackingData | undefined> {
    try {
      // Ensure storage directory exists
      await this.ensureStorageDirectory();

      if (!(await this.exists())) {
        this.logger.info('No existing data file found, returning default data');
        return this.createDefaultData();
      }

      const fileContent = await fs.readFile(this.dataPath, 'utf-8');
      const rawData = JSON.parse(fileContent);
      
      // Convert raw data to typed data with proper Map and Date objects
      const trackingData = this.deserializeData(rawData);
      
      // Validate workspace compatibility
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
      if (currentWorkspace && trackingData.workspacePath && 
          trackingData.workspacePath !== currentWorkspace.uri.fsPath) {
        this.logger.warn('Loaded data belongs to different workspace', {
          dataWorkspace: trackingData.workspaceName,
          currentWorkspace: currentWorkspace.name
        });
        // Return default data for this workspace instead of incompatible data
        return this.createDefaultData();
      }
      
      // Update workspace info if missing (for backward compatibility)
      if (currentWorkspace && !trackingData.workspacePath) {
        trackingData.workspacePath = currentWorkspace.uri.fsPath;
        trackingData.workspaceName = currentWorkspace.name;
      }
      
      this.logger.info('Tracking data loaded successfully', { 
        projectCount: trackingData.projects.size,
        hasCurrentSession: !!trackingData.currentSession,
        workspace: trackingData.workspaceName || 'unknown'
      });
      
      return trackingData;
    } catch (error) {
      this.logger.error('Failed to load tracking data', error as Error);
      
      // Try to load from backup
      try {
        const backupContent = await fs.readFile(this.backupPath, 'utf-8');
        const rawBackupData = JSON.parse(backupContent);
        const backupData = this.deserializeData(rawBackupData);
        
        this.logger.warn('Loaded data from backup file');
        return backupData;
      } catch (backupError) {
        this.logger.error('Failed to load backup data', backupError as Error);
        return this.createDefaultData();
      }
    }
  }

  /**
   * Save tracking data to storage
   */
  async save(data: TrackingData): Promise<void> {
    try {
      await this.ensureStorageDirectory();
      
      // Create backup before saving
      if (await this.exists()) {
        await this.backup();
      }

      // Update save timestamp
      data.lastSaved = new Date();
      
      // Serialize data for JSON storage
      const serializedData = this.serializeData(data);
      const jsonData = JSON.stringify(serializedData, null, 2);
      
      await fs.writeFile(this.dataPath, jsonData, 'utf-8');
      
      this.logger.debug('Tracking data saved successfully', { 
        projectCount: data.projects.size,
        dataSize: jsonData.length 
      });
    } catch (error) {
      this.logger.error('Failed to save tracking data', error as Error);
      throw error;
    }
  }

  /**
   * Create backup of current data
   */
  async backup(): Promise<void> {
    try {
      if (await this.exists()) {
        await fs.copyFile(this.dataPath, this.backupPath);
        this.logger.debug('Backup created successfully');
      }
    } catch (error) {
      this.logger.error('Failed to create backup', error as Error);
      // Don't throw - backup failure shouldn't prevent saving
    }
  }

  /**
   * Check if data file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.dataPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all tracking data
   */
  async clear(): Promise<void> {
    try {
      // Create backup before clearing
      await this.backup();
      
      if (await this.exists()) {
        await fs.unlink(this.dataPath);
        this.logger.info('Tracking data cleared');
      }
    } catch (error) {
      this.logger.error('Failed to clear tracking data', error as Error);
      throw error;
    }
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      const storageDir = path.dirname(this.dataPath);
      await fs.mkdir(storageDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create storage directory', error as Error);
      throw error;
    }
  }

  /**
   * Create default empty tracking data
   */
  private createDefaultData(): TrackingData {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const data: TrackingData = {
      projects: new Map<string, ProjectStats>(),
      lastActivity: new Date(),
      totalTimeTracked: 0,
      version: this.DATA_VERSION,
      lastSaved: new Date()
    };
    
    if (workspaceFolder) {
      data.workspacePath = workspaceFolder.uri.fsPath;
      data.workspaceName = workspaceFolder.name;
    }
    
    return data;
  }

  /**
   * Serialize tracking data for JSON storage
   */
  private serializeData(data: TrackingData): any {
    return {
      projects: Array.from(data.projects.entries()).map(([key, value]) => ({
        key,
        value: {
          ...value,
          lastActivity: value.lastActivity.toISOString(),
          firstSession: value.firstSession.toISOString(),
          sessions: value.sessions.map(session => ({
            ...session,
            startTime: session.startTime.toISOString(),
            endTime: session.endTime?.toISOString(),
            lastActivity: session.lastActivity.toISOString(),
            lastActiveTime: session.lastActiveTime.toISOString()
          }))
        }
      })),
      currentSession: data.currentSession ? {
        ...data.currentSession,
        startTime: data.currentSession.startTime.toISOString(),
        endTime: data.currentSession.endTime?.toISOString(),
        lastActivity: data.currentSession.lastActivity.toISOString(),
        lastActiveTime: data.currentSession.lastActiveTime.toISOString()
      } : undefined,
      lastActivity: data.lastActivity.toISOString(),
      totalTimeTracked: data.totalTimeTracked,
      version: data.version,
      lastSaved: data.lastSaved.toISOString(),
      workspacePath: data.workspacePath,
      workspaceName: data.workspaceName
    };
  }

  /**
   * Deserialize tracking data from JSON storage
   */
  private deserializeData(rawData: any): TrackingData {
    const projects = new Map<string, ProjectStats>();
    
    if (rawData.projects && Array.isArray(rawData.projects)) {
      rawData.projects.forEach((entry: any) => {
        const projectStats: ProjectStats = {
          ...entry.value,
          lastActivity: new Date(entry.value.lastActivity),
          firstSession: new Date(entry.value.firstSession),
          sessions: entry.value.sessions?.map((session: any) => ({
            ...session,
            startTime: new Date(session.startTime),
            endTime: session.endTime ? new Date(session.endTime) : undefined,
            lastActivity: new Date(session.lastActivity),
            lastActiveTime: new Date(session.lastActiveTime || session.lastActivity)
          })) || []
        };
        projects.set(entry.key, projectStats);
      });
    }

    const data: TrackingData = {
      projects,
      currentSession: rawData.currentSession ? {
        ...rawData.currentSession,
        startTime: new Date(rawData.currentSession.startTime),
        endTime: rawData.currentSession.endTime ? new Date(rawData.currentSession.endTime) : undefined,
        lastActivity: new Date(rawData.currentSession.lastActivity),
        lastActiveTime: new Date(rawData.currentSession.lastActiveTime || rawData.currentSession.lastActivity)
      } : undefined,
      lastActivity: new Date(rawData.lastActivity || new Date()),
      totalTimeTracked: rawData.totalTimeTracked || 0,
      version: rawData.version || this.DATA_VERSION,
      lastSaved: new Date(rawData.lastSaved || new Date())
    };

    // Add workspace properties if they exist
    if (rawData.workspacePath) {
      data.workspacePath = rawData.workspacePath;
    }
    if (rawData.workspaceName) {
      data.workspaceName = rawData.workspaceName;
    }

    return data;
  }
} 