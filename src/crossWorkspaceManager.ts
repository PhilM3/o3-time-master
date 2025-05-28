/**
 * Cross-workspace manager for aggregating data from all workspaces
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TrackingData, ProjectStats, Logger } from './types';

export interface AggregatedData {
  /** All projects from all workspaces */
  allProjects: Map<string, ProjectStats>;
  
  /** Total time across all workspaces */
  totalTime: number;
  
  /** Number of workspaces found */
  workspaceCount: number;
  
  /** Last update timestamp */
  lastUpdated: Date;
  
  /** Workspace names and their data */
  workspaces: Array<{
    name: string;
    path: string;
    data: TrackingData;
  }>;
}

export class CrossWorkspaceManager {
  private readonly logger: Logger;
  private readonly globalStoragePath: string;
  private cachedData: AggregatedData | undefined;
  private lastCacheUpdate = 0;
  private readonly CACHE_DURATION = 30000; // 30 seconds

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.logger = logger;
    this.globalStoragePath = context.globalStorageUri.fsPath;
  }

  /**
   * Get aggregated data from all workspaces
   */
  async getAggregatedData(): Promise<AggregatedData> {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.cachedData && (now - this.lastCacheUpdate) < this.CACHE_DURATION) {
      return this.cachedData;
    }

    try {
      const workspacesDir = path.join(this.globalStoragePath, 'workspaces');
      const aggregatedData = await this.loadAllWorkspaceData(workspacesDir);
      
      this.cachedData = aggregatedData;
      this.lastCacheUpdate = now;
      
      this.logger.info('Aggregated data loaded', {
        workspaceCount: aggregatedData.workspaceCount,
        totalProjects: aggregatedData.allProjects.size,
        totalTime: aggregatedData.totalTime
      });
      
      return aggregatedData;
    } catch (error) {
      this.logger.error('Failed to load aggregated data', error as Error);
      return this.createEmptyAggregatedData();
    }
  }

  /**
   * Force refresh of cached data
   */
  async refreshCache(): Promise<void> {
    this.cachedData = undefined;
    this.lastCacheUpdate = 0;
    await this.getAggregatedData();
  }

  /**
   * Load data from all workspace directories
   */
  private async loadAllWorkspaceData(workspacesDir: string): Promise<AggregatedData> {
    const allProjects = new Map<string, ProjectStats>();
    const workspaces: Array<{ name: string; path: string; data: TrackingData }> = [];
    let totalTime = 0;

    try {
      // Check if workspaces directory exists
      await fs.access(workspacesDir);
      
      const workspaceDirs = await fs.readdir(workspacesDir);
      
      for (const workspaceHash of workspaceDirs) {
        const workspacePath = path.join(workspacesDir, workspaceHash);
        const dataFile = path.join(workspacePath, 'timeTrackingData.json');
        
        try {
          const fileContent = await fs.readFile(dataFile, 'utf-8');
          const rawData = JSON.parse(fileContent);
          const trackingData = this.deserializeData(rawData);
          
          // Add workspace to list
          workspaces.push({
            name: trackingData.workspaceName || `Workspace ${workspaceHash}`,
            path: trackingData.workspacePath || 'Unknown',
            data: trackingData
          });
          
          // Merge projects (use full path as key to avoid conflicts)
          trackingData.projects.forEach((project, projectPath) => {
            const uniqueKey = `${trackingData.workspaceName || workspaceHash}:${projectPath}`;
            allProjects.set(uniqueKey, {
              ...project,
              projectName: `${project.projectName} (${trackingData.workspaceName || 'Unknown'})`
            });
            totalTime += project.totalTime;
          });
          
        } catch (error) {
          this.logger.warn(`Failed to load workspace data from ${workspaceHash}`, error as Error);
        }
      }
    } catch (error) {
      this.logger.debug('Workspaces directory does not exist or is empty');
    }

    return {
      allProjects,
      totalTime,
      workspaceCount: workspaces.length,
      lastUpdated: new Date(),
      workspaces
    };
  }

  /**
   * Deserialize tracking data from JSON
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
      version: rawData.version || '1.0.0',
      lastSaved: new Date(rawData.lastSaved || new Date())
    };

    if (rawData.workspacePath) {
      data.workspacePath = rawData.workspacePath;
    }
    if (rawData.workspaceName) {
      data.workspaceName = rawData.workspaceName;
    }

    return data;
  }

  /**
   * Create empty aggregated data
   */
  private createEmptyAggregatedData(): AggregatedData {
    return {
      allProjects: new Map(),
      totalTime: 0,
      workspaceCount: 0,
      lastUpdated: new Date(),
      workspaces: []
    };
  }
} 