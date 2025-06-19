/**
 * Main time tracker class that coordinates all tracking functionality
 */

import * as vscode from 'vscode';
import { ActivityMonitor } from './activityMonitor';
import { FileStorageManager } from './storageManager';
import { 
  TrackingData, 
  TimeSession, 
  ProjectStats, 
  ExtensionConfig, 
  ActivityEvent, 
  Logger
} from './types';
import { formatStatusBarTime, formatDate, formatDetailedTime, safeTimeDifference } from './timeUtils';
import { TimeViewProvider, ProjectsViewProvider } from './timeViewProvider';

/**
 * Main TimeTracker class - coordinates activity monitoring, data storage, and UI
 */
export class TimeTracker {

  private readonly logger: Logger;
  private readonly storage: FileStorageManager;
  private readonly activityMonitor: ActivityMonitor;
  
  private trackingData: TrackingData;
  private config: ExtensionConfig;
  private statusBarItem: vscode.StatusBarItem;
  private timer: NodeJS.Timer | undefined;
  private saveTimer: NodeJS.Timer | undefined;
  
  private isRunning = false;
  private isPaused = false;
  private saveCounter = 0;
  private lastSessionDay: string | undefined; // Track the day of the current session for midnight detection
  
  private timeViewProvider?: TimeViewProvider;
  private projectsViewProvider?: ProjectsViewProvider;

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.logger = logger;
    
    // Initialize configuration
    this.config = this.loadConfiguration();
    
    // Initialize storage
    this.storage = new FileStorageManager(context, logger);
    
    // Initialize activity monitor
    this.activityMonitor = new ActivityMonitor(logger, this.config);
    
    // Initialize status bar
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 
      100
    );
    this.statusBarItem.command = 'o3-time-tracker.showQuickPick';
    
    // Initialize with empty data (will be loaded in start())
    this.trackingData = {
      projects: new Map(),
      lastActivity: new Date(),
      totalTimeTracked: 0,
      version: '1.0.0',
      lastSaved: new Date()
    };

    // Setup activity monitoring
    this.activityMonitor.onActivity(this.onActivity.bind(this));
    
    // Register configuration change listener
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(this.onConfigurationChanged.bind(this))
    );

    this.logger.info('TimeTracker initialized');
  }

  /**
   * Set view providers for updating the sidebar
   */
  setViewProviders(timeViewProvider: TimeViewProvider, projectsViewProvider: ProjectsViewProvider): void {
    this.timeViewProvider = timeViewProvider;
    this.projectsViewProvider = projectsViewProvider;
    this.updateViews();
  }

  /**
   * Update view providers with current data
   */
  private updateViews(): void {
    if (this.timeViewProvider) {
      this.timeViewProvider.updateData(this.trackingData);
    }
    if (this.projectsViewProvider) {
      this.projectsViewProvider.updateData(this.trackingData);
    }
  }

  /**
   * Start time tracking
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.info('TimeTracker already running');
      return;
    }

    try {
      // Load existing data
      const loadedData = await this.storage.load();
      if (loadedData) {
        this.trackingData = loadedData;
        this.logger.info('Loaded existing tracking data', { 
          projectCount: this.trackingData.projects.size 
        });
      }

      // Start or resume session if auto-start is enabled
      if (this.config.autoStart) {
        await this.startOrResumeSession();
      }

      // Start main timer (1 second interval)
      this.timer = setInterval(this.tick.bind(this), 1000);
      
      // Start auto-save timer
      this.saveTimer = setInterval(
        this.autoSave.bind(this), 
        this.config.saveInterval * 1000
      );

      this.isRunning = true;
      this.isPaused = false;
      this.updateStatusBar();

      this.logger.info('TimeTracker started successfully');
    } catch (error) {
      this.logger.error('Failed to start TimeTracker', error as Error);
      throw error;
    }
  }

  /**
   * Pause time tracking
   */
  pause(): void {
    if (!this.isRunning) {
      this.logger.info('TimeTracker not running, cannot pause');
      return;
    }

    this.isPaused = true;
    
    if (this.trackingData.currentSession) {
      this.trackingData.currentSession.isActive = false;
    }

    this.updateStatusBar();
    this.logger.info('TimeTracker paused');
  }

  /**
   * Resume time tracking
   */
  resume(): void {
    if (!this.isRunning) {
      this.logger.info('TimeTracker not running, cannot resume');
      return;
    }

    this.isPaused = false;
    
    if (this.trackingData.currentSession) {
      this.trackingData.currentSession.isActive = true;
      this.trackingData.currentSession.lastActivity = new Date();
    }

    this.updateStatusBar();
    this.logger.info('TimeTracker resumed');
  }

  /**
   * Stop time tracking
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.info('TimeTracker not running, cannot stop');
      return;
    }

    try {
      // End current session
      await this.endCurrentSession();
      
      // Stop timers
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
      
      if (this.saveTimer) {
        clearInterval(this.saveTimer);
        this.saveTimer = undefined;
      }

      // Save final data
      await this.storage.save(this.trackingData);

      this.isRunning = false;
      this.isPaused = false;
      this.updateStatusBar();

      this.logger.info('TimeTracker stopped successfully');
    } catch (error) {
      this.logger.error('Failed to stop TimeTracker', error as Error);
      throw error;
    }
  }

  /**
   * Reset current session
   */
  async reset(): Promise<void> {
    if (this.trackingData.currentSession) {
      const projectPath = this.trackingData.currentSession.projectPath;
      
      // Remove from project stats
      const projectStats = this.trackingData.projects.get(projectPath);
      if (projectStats) {
        // Remove the current session from project sessions
        projectStats.sessions = projectStats.sessions.filter(
          session => session.id !== this.trackingData.currentSession?.id
        );
        
        // Recalculate project stats
        this.recalculateProjectStats(projectStats);
      }

             // Clear current session
       delete this.trackingData.currentSession;
      
      // Reset the session day tracking
      this.lastSessionDay = undefined;
      
      await this.storage.save(this.trackingData);
      this.updateStatusBar();
      
      this.logger.info('Current session reset');
    }
  }

  /**
   * Get today's total time for a project including current session if applicable
   */
  private getTodayProjectTime(projectPath: string): number {
    const today = new Date();
    const todayDateString = today.toLocaleDateString('de-DE');
    
    let totalTodayTime = 0;
    this.logger.debug('getTodayProjectTime called', { projectPath, todayDateString });

    // Add time from today's completed sessions (only sessions with endTime)
    const projectStats = this.trackingData.projects.get(projectPath);
    if (projectStats) {
      this.logger.debug('Found project stats', { 
        projectName: projectStats.projectName, 
        totalSessions: projectStats.sessions.length 
      });
      
      projectStats.sessions.forEach(session => {
        const sessionDate = session.startTime.toLocaleDateString('de-DE');
        this.logger.debug('Checking session', { 
          sessionDate, 
          todayDateString, 
          isToday: sessionDate === todayDateString,
          hasEndTime: !!session.endTime,
          sessionTime: session.totalTime 
        });
        
        if (sessionDate === todayDateString && session.endTime) {
          // Only count completed sessions to avoid double counting with current session
          totalTodayTime += session.totalTime;
          this.logger.debug('Added completed session time', { 
            sessionTime: session.totalTime, 
            newTotal: totalTodayTime 
          });
        }
      });
    } else {
      this.logger.debug('No project stats found for path', { projectPath });
    }

    // Add current session time if it's from today and belongs to this project
    if (this.trackingData.currentSession && 
        this.trackingData.currentSession.projectPath === projectPath) {
      const sessionDate = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
      this.logger.debug('Checking current session', { 
        currentSessionPath: this.trackingData.currentSession.projectPath,
        sessionDate, 
        todayDateString,
        isToday: sessionDate === todayDateString,
        currentSessionTime: this.trackingData.currentSession.totalTime 
      });
      
      if (sessionDate === todayDateString) {
        // Use totalTime to show only active work time, not idle time
        totalTodayTime += this.trackingData.currentSession.totalTime;
        this.logger.debug('Added current session time', { 
          currentSessionTime: this.trackingData.currentSession.totalTime, 
          finalTotal: totalTodayTime 
        });
      }
    } else {
      this.logger.debug('Current session check failed', { 
        hasCurrentSession: !!this.trackingData.currentSession,
        currentSessionPath: this.trackingData.currentSession?.projectPath,
        targetPath: projectPath 
      });
    }

    this.logger.debug('getTodayProjectTime result', { totalTodayTime });
    return totalTodayTime;
  }

  /**
   * Show today's project statistics
   */
  async showStatistics(): Promise<void> {
    const today = new Date();
    const todayDateString = today.toLocaleDateString('de-DE');
    
    const items: vscode.QuickPickItem[] = [];
    
    // Collect all projects that have time today
    const projectsWithTodayTime: Array<{ project: any; todayTime: number }> = [];
    let totalTodayTime = 0;

    this.trackingData.projects.forEach(project => {
      const todayTime = this.getTodayProjectTime(project.projectPath);
      if (todayTime > 0) {
        projectsWithTodayTime.push({ project, todayTime });
        totalTodayTime += todayTime;
      }
    });

    // Add current session project if it's not already included
    if (this.trackingData.currentSession) {
      const currentSessionDate = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
      if (currentSessionDate === todayDateString) {
        const currentProjectPath = this.trackingData.currentSession.projectPath;
        const existingProject = projectsWithTodayTime.find(p => p.project.projectPath === currentProjectPath);
        
        if (!existingProject) {
          // Project not in list yet, add it
          const todayTime = this.getTodayProjectTime(currentProjectPath);
          if (todayTime > 0) {
            const projectStats = this.trackingData.projects.get(currentProjectPath);
            if (projectStats) {
              projectsWithTodayTime.push({ project: projectStats, todayTime });
              totalTodayTime += todayTime;
            }
          }
        }
      }
    }

    // Sort by today's time (highest first)
    projectsWithTodayTime.sort((a, b) => b.todayTime - a.todayTime);

    if (projectsWithTodayTime.length > 0) {
      projectsWithTodayTime.forEach(({ project, todayTime }) => {
        const isCurrentProject = this.trackingData.currentSession?.projectPath === project.projectPath;
        const icon = isCurrentProject ? '🟢 ' : '⏱️ ';
        
        items.push({
          label: `${icon}${project.projectName}: ${formatDetailedTime(todayTime)}`,
          description: isCurrentProject ? 'Aktuell aktiv' : 'Heute gearbeitet',
          detail: `Projekt-Pfad: ${project.projectPath}`
        });
      });
    } else {
      items.push({
        label: 'Heute noch keine Arbeitszeit getrackt',
        description: 'Starten Sie das Tracking, um heutige Arbeitszeiten zu sehen'
      });
    }

    await vscode.window.showQuickPick(items, {
      title: `Heutige Arbeitszeiten (${todayDateString}) - Gesamt: ${formatDetailedTime(totalTodayTime)}`,
      canPickMany: false
    });
  }

  /**
   * Show detailed time log with start-end times for each session
   */
  async showDetailedTimeLog(): Promise<void> {
    const items: vscode.QuickPickItem[] = [];
    
    // Current session info
    if (this.trackingData.currentSession) {
      // Use totalTime to show only active work time, not idle time
      const sessionTime = this.trackingData.currentSession.totalTime;
      const startTime = this.trackingData.currentSession.startTime.toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      items.push({
        label: `🟢 Aktuelle Session: ${startTime} - läuft (${formatDetailedTime(sessionTime)})`,
        description: this.trackingData.currentSession.projectName,
        detail: `${this.trackingData.currentSession.textChanges} Textänderungen, ${this.trackingData.currentSession.cursorMovements} Cursor-Bewegungen`
      });
      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    }

    // Collect all sessions from all projects and sort by date
    const allSessions: Array<{ session: any; projectName: string }> = [];
    
    this.trackingData.projects.forEach(project => {
      project.sessions.forEach(session => {
        allSessions.push({ session, projectName: project.projectName });
      });
    });

    // Sort by start time (newest first)
    allSessions.sort((a, b) => b.session.startTime.getTime() - a.session.startTime.getTime());

    // Group sessions by date
    const sessionsByDate = new Map<string, Array<{ session: any; projectName: string }>>();
    
    allSessions.forEach(item => {
      const dateKey = item.session.startTime.toLocaleDateString('de-DE');
      if (!sessionsByDate.has(dateKey)) {
        sessionsByDate.set(dateKey, []);
      }
      sessionsByDate.get(dateKey)!.push(item);
    });

    // Display sessions grouped by date
    sessionsByDate.forEach((sessions, date) => {
      // Date header - add current session time if it's from this date
      let totalDayTime = sessions.reduce((sum, item) => sum + item.session.totalTime, 0);
      if (this.trackingData.currentSession) {
        const currentSessionDate = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
        if (currentSessionDate === date) {
          totalDayTime += this.trackingData.currentSession.totalTime;
        }
      }
      
      items.push({
        label: `📅 ${date} - Gesamt: ${formatDetailedTime(totalDayTime)}`,
        description: `${sessions.length} Sessions`,
        detail: '',
        kind: vscode.QuickPickItemKind.Separator
      });

      // Sessions for this date
      sessions.forEach(({ session, projectName }) => {
        const startTime = session.startTime.toLocaleTimeString('de-DE', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const endTime = session.endTime 
          ? session.endTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          : 'läuft';
        
        const duration = formatDetailedTime(session.totalTime);
        const timeRange = `${startTime}-${endTime}`;
        
        items.push({
          label: `  ⏱️  ${timeRange} (${duration})`,
          description: projectName,
          detail: `${session.textChanges} Textänderungen, ${session.cursorMovements} Cursor-Bewegungen`
        });
      });
    });

    if (items.length === 0) {
      items.push({
        label: 'Keine Tracking-Daten verfügbar',
        description: 'Starten Sie das Tracking, um Arbeitszeiten zu sehen'
      });
    }

    await vscode.window.showQuickPick(items, {
      title: 'Detailliertes Arbeitszeit-Log',
      canPickMany: false
    });
  }

  /**
   * Show today's work sessions
   */
  async showTodaysSessions(): Promise<void> {
    const today = new Date();
    const todayDateString = today.toLocaleDateString('de-DE');
    
    const items: vscode.QuickPickItem[] = [];
    let totalTodayTime = 0;

    // Current session if it's from today
    if (this.trackingData.currentSession) {
      const sessionDate = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
      if (sessionDate === todayDateString) {
        // Use totalTime to show only active work time, not idle time
        const sessionTime = this.trackingData.currentSession.totalTime;
        totalTodayTime += sessionTime;
        
        const startTime = this.trackingData.currentSession.startTime.toLocaleTimeString('de-DE', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        items.push({
          label: `🟢 ${startTime} - läuft (${formatDetailedTime(sessionTime)})`,
          description: this.trackingData.currentSession.projectName,
          detail: `${this.trackingData.currentSession.textChanges} Textänderungen, ${this.trackingData.currentSession.cursorMovements} Cursor-Bewegungen`
        });
      }
    }

    // Today's completed sessions
    const todaysSessions: Array<{ session: any; projectName: string }> = [];
    
    this.trackingData.projects.forEach(project => {
      project.sessions.forEach(session => {
        const sessionDate = session.startTime.toLocaleDateString('de-DE');
        if (sessionDate === todayDateString) {
          todaysSessions.push({ session, projectName: project.projectName });
          totalTodayTime += session.totalTime;
        }
      });
    });

    // Sort by start time
    todaysSessions.sort((a, b) => a.session.startTime.getTime() - b.session.startTime.getTime());

    if (todaysSessions.length > 0 || this.trackingData.currentSession) {
      if (items.length > 0) {
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
      }
      
      todaysSessions.forEach(({ session, projectName }) => {
        const startTime = session.startTime.toLocaleTimeString('de-DE', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const endTime = session.endTime 
          ? session.endTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          : 'läuft';
        
        const duration = formatDetailedTime(session.totalTime);
        const timeRange = `${startTime}-${endTime}`;
        
        items.push({
          label: `⏱️  ${timeRange} (${duration})`,
          description: projectName,
          detail: `${session.textChanges} Textänderungen, ${session.cursorMovements} Cursor-Bewegungen`
        });
      });
    }

    if (items.length === 0) {
      items.push({
        label: 'Heute noch keine Arbeitszeit getrackt',
        description: 'Starten Sie das Tracking, um heutige Arbeitszeiten zu sehen'
      });
    }

    await vscode.window.showQuickPick(items, {
      title: `Heutige Arbeitszeiten (${todayDateString}) - Gesamt: ${formatDetailedTime(totalTodayTime)}`,
      canPickMany: false
    });
  }

  /**
   * Export tracking data
   */
  async exportData(): Promise<void> {
    const options: vscode.SaveDialogOptions = {
      defaultUri: vscode.Uri.file(`time-tracking-${formatDate(new Date())}.json`),
      filters: {
        'JSON Files': ['json'],
        'All Files': ['*']
      }
    };

    const uri = await vscode.window.showSaveDialog(options);
    if (!uri) {
      return;
    }

    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        version: this.trackingData.version,
        projects: Array.from(this.trackingData.projects.values()),
        totalTimeTracked: this.trackingData.totalTimeTracked
      };

      await vscode.workspace.fs.writeFile(
        uri, 
        Buffer.from(JSON.stringify(exportData, null, 2), 'utf8')
      );

      vscode.window.showInformationMessage(`Time tracking data exported to ${uri.fsPath}`);
      this.logger.info('Data exported successfully', { exportPath: uri.fsPath });
    } catch (error) {
      this.logger.error('Failed to export data', error as Error);
      vscode.window.showErrorMessage('Failed to export time tracking data');
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.activityMonitor.dispose();
    this.statusBarItem.dispose();
    
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    
    this.logger.info('TimeTracker disposed');
  }

  /**
   * Main timer tick function
   */
  private async tick(): Promise<void> {
    try {
      // Check for midnight crossing and split session if needed
      if (this.trackingData.currentSession && !this.isPaused) {
        await this.checkAndHandleMidnightCrossing();
      }

      // Check for project change and switch sessions if needed
      if (this.config.autoEndSessionOnProjectChange && this.trackingData.currentSession && !this.isPaused) {
        await this.checkAndHandleProjectChange();
      }

      // Check for auto-end session after idle time
      if (this.config.autoEndSessionAfterIdle && this.trackingData.currentSession && !this.isPaused) {
        await this.checkAndHandleIdleSessionEnd();
      }

      // Update current session time if active
      if (this.trackingData.currentSession && !this.isPaused) {
        const isActive = this.activityMonitor.isActive();
        const now = new Date();
        
        if (isActive) {
          // Add time since last active time to total time (only active time)
          const timeSinceLastActive = safeTimeDifference(now, this.trackingData.currentSession.lastActiveTime, 1);
          
          if (timeSinceLastActive > 0) {
            this.trackingData.currentSession.totalTime += timeSinceLastActive;
          } else {
            // Log warning if time calculation failed
            this.logger.warn('Invalid time difference detected, skipping time addition', {
              lastActiveTime: this.trackingData.currentSession.lastActiveTime.toISOString(),
              now: now.toISOString()
            });
          }
          
          this.trackingData.currentSession.lastActiveTime = now;
          this.trackingData.currentSession.lastActivity = now;
          this.trackingData.lastActivity = now;
        }
        // If not active (idle), don't add any time to totalTime
      }
      
      // Auto-start session if configured and activity detected
      if (this.config.autoStart && !this.trackingData.currentSession && !this.isPaused) {
        if (this.activityMonitor.isActive()) {
          await this.startOrResumeSession();
        }
      }
      
      this.updateStatusBar();
      this.updateViews();
    } catch (error) {
      this.logger.error('Error in tick function', error as Error);
    }
  }

  /**
   * Handle activity events from the monitor
   */
  private async onActivity(event: ActivityEvent): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Handle sleep/wake events first
      if (event.type === 'sleep') {
        this.logger.info('Sleep event detected - automatically ending session', { 
          timestamp: event.timestamp.toISOString() 
        });
        
        // Auto-end session during sleep if configured
        if (this.trackingData.currentSession && !this.isPaused) {
          if (this.config.autoEndSessionAfterIdle) {
            const sleepTime = event.timestamp;
            
            // End the session cleanly, providing the exact sleep time
            await this.endCurrentSession(sleepTime);

          } else {
            // Just pause if auto-end is disabled
            this.trackingData.currentSession.isActive = false;
            this.trackingData.currentSession.lastActivity = event.timestamp;
            this.isPaused = true;
          }
          this.updateStatusBar();
        }
        return;
      }
      
      if (event.type === 'wake') {
        this.logger.info('Wake event detected - resuming tracking', { 
          timestamp: event.timestamp.toISOString() 
        });
        
        // Auto-resume tracking after wake
        if (this.isPaused && this.trackingData.currentSession) {
          this.isPaused = false;
          this.trackingData.currentSession.isActive = true;
          this.trackingData.currentSession.lastActivity = event.timestamp;
          this.trackingData.currentSession.lastActiveTime = event.timestamp;
          this.updateStatusBar();
        } else if (this.config.autoStart && !this.trackingData.currentSession) {
          // Start new session if auto-start is enabled and no current session
          await this.startOrResumeSession();
        }
        return;
      }

      // Skip regular activity processing if paused
      if (this.isPaused) {
        return;
      }

      // Update activity counters in current session
      if (this.trackingData.currentSession) {
        const now = new Date();
        
        if (event.type === 'text_change') {
          this.trackingData.currentSession.textChanges++;
        } else if (event.type === 'cursor_change') {
          this.trackingData.currentSession.cursorMovements++;
        }
        
        // Update last active time on any activity
        this.trackingData.currentSession.lastActiveTime = now;
        this.trackingData.currentSession.lastActivity = now;
      }

      // Auto-start session if needed
      if (this.config.autoStart && !this.trackingData.currentSession) {
        await this.startOrResumeSession();
      }

      this.logger.debug('Activity processed', { 
        type: event.type, 
        hasCurrentSession: !!this.trackingData.currentSession 
      });
    } catch (error) {
      this.logger.error('Error processing activity', error as Error);
    }
  }

  /**
   * Start or resume a tracking session
   */
  private async startOrResumeSession(): Promise<void> {
    const currentProject = this.getCurrentProject();
    if (!currentProject) {
      this.logger.debug('No current project detected, cannot start session');
      return;
    }

    // Check if we should resume an existing session for this project
    const existingSession = this.findRecentSession(currentProject.path);
    
    if (existingSession && this.shouldResumeSession(existingSession)) {
      // Resume existing session
      const now = new Date();
      existingSession.isActive = true;
      existingSession.lastActivity = now;
      existingSession.lastActiveTime = now; // Reset active time when resuming
      this.trackingData.currentSession = existingSession;
      this.logger.info('Resumed existing session', { projectName: currentProject.name });
    } else {
      // Start new session
      const now = new Date();
      const newSession: TimeSession = {
        id: this.generateSessionId(),
        projectName: currentProject.name,
        projectPath: currentProject.path,
        startTime: now,
        totalTime: 0,
        isActive: true,
        lastActivity: now,
        lastActiveTime: now,
        textChanges: 0,
        cursorMovements: 0
      };

      this.trackingData.currentSession = newSession;
      this.addSessionToProject(newSession);
      this.logger.info('Started new session', { projectName: currentProject.name });
    }

    // Track the day of the new/resumed session
    if (this.trackingData.currentSession) {
      this.lastSessionDay = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
    }
  }

  /**
   * End the current session
   * @param endTime Optional end time for the session
   */
  private async endCurrentSession(endTime?: Date): Promise<void> {
    if (!this.trackingData.currentSession) {
      return;
    }

    const session = this.trackingData.currentSession;
    const finalEndTime = endTime || session.endTime || new Date();

    session.endTime = finalEndTime;
    session.isActive = false;
    
    // Add any remaining active time if user was active when stopping
    if (this.activityMonitor.isActive()) {
      const remainingActiveTime = safeTimeDifference(finalEndTime, session.lastActiveTime, this.config.idleThreshold);
      if (remainingActiveTime > 0) {
        session.totalTime += remainingActiveTime;
      }
    }
    // Note: totalTime now contains only active time, not total elapsed time

    // Update project stats
    const projectStats = this.trackingData.projects.get(session.projectPath);
    if (projectStats) {
      this.recalculateProjectStats(projectStats);
    }

         delete this.trackingData.currentSession;
    await this.storage.save(this.trackingData);

    // Reset the session day tracking
    this.lastSessionDay = undefined;

    this.logger.info('Session ended', { 
      duration: formatDetailedTime(session.totalTime),
      projectName: session.projectName 
    });
  }

  /**
   * Get current project information
   */
  private getCurrentProject(): { name: string; path: string } | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
         if (workspaceFolders && workspaceFolders.length > 0) {
       // Use first workspace folder as primary project
       const folder = workspaceFolders[0];
       if (folder) {
         return {
           name: folder.name,
           path: folder.uri.fsPath
         };
       }
     }

    // Fallback: use currently active file's directory
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const fileUri = activeEditor.document.uri;
      if (fileUri.scheme === 'file') {
        const filePath = fileUri.fsPath;
        const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
        return {
          name: fileName,
          path: filePath
        };
      }
    }

    return undefined;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load configuration from VS Code settings
   */
  private loadConfiguration(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration('o3-time-tracker');
    
    return {
      idleThreshold: config.get('idleThreshold', 5),
      autoStart: config.get('autoStart', true),
      showInStatusBar: config.get('showInStatusBar', true),
      saveInterval: config.get('saveInterval', 30),
      trackBackground: config.get('trackBackground', true),
      autoEndSessionAfterIdle: config.get('autoEndSessionAfterIdle', true),
      autoEndIdleThreshold: config.get('autoEndIdleThreshold', 30),
      autoEndSessionOnProjectChange: config.get('autoEndSessionOnProjectChange', true)
    };
  }

  /**
   * Handle configuration changes
   */
  private onConfigurationChanged(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration('o3-time-tracker')) {
      const newConfig = this.loadConfiguration();
      this.config = newConfig;
      this.activityMonitor.updateConfig(newConfig);
      
      this.logger.info('Configuration updated');
    }
  }

  /**
   * Update status bar display
   */
  private updateStatusBar(): void {
    if (!this.config.showInStatusBar) {
      this.statusBarItem.hide();
      return;
    }

    if (!this.isRunning) {
      this.statusBarItem.text = '⏱ Stopped';
      this.statusBarItem.tooltip = 'Time Tracker is stopped. Click to start.';
    } else if (this.isPaused) {
      this.statusBarItem.text = '⏸ Paused';
      this.statusBarItem.tooltip = 'Time Tracker is paused. Click to resume.';
    } else if (this.trackingData.currentSession) {
      // Show today's accumulated time for the current project
      const todayProjectTime = this.getTodayProjectTime(this.trackingData.currentSession.projectPath);
      const time = formatStatusBarTime(todayProjectTime);
      this.statusBarItem.text = `⏱ ${time}`;
      this.statusBarItem.tooltip = `Heutige Arbeitszeit für ${this.trackingData.currentSession.projectName}: ${formatDetailedTime(todayProjectTime)}`;
    } else {
      this.statusBarItem.text = '⏱ Ready';
      this.statusBarItem.tooltip = 'Time Tracker is ready. Start working to begin tracking.';
    }

    this.statusBarItem.show();
  }

  /**
   * Auto-save tracking data
   */
  private async autoSave(): Promise<void> {
    this.saveCounter++;
    
    if (this.saveCounter >= 1) { // Save every interval
      try {
        await this.storage.save(this.trackingData);
        this.saveCounter = 0;
        this.logger.debug('Auto-save completed');
      } catch (error) {
        this.logger.error('Auto-save failed', error as Error);
      }
    }
  }

  /**
   * Add session to project statistics
   */
  private addSessionToProject(session: TimeSession): void {
    let projectStats = this.trackingData.projects.get(session.projectPath);
    
    if (!projectStats) {
      projectStats = {
        projectName: session.projectName,
        projectPath: session.projectPath,
        totalTime: 0,
        sessions: [],
        lastActivity: session.startTime,
        firstSession: session.startTime,
        averageSessionDuration: 0,
        activeDays: 1
      };
      this.trackingData.projects.set(session.projectPath, projectStats);
    }

    projectStats.sessions.push(session);
    this.recalculateProjectStats(projectStats);
  }

  /**
   * Recalculate project statistics
   */
  private recalculateProjectStats(projectStats: ProjectStats): void {
    const sessions = projectStats.sessions.filter(s => s.endTime); // Only completed sessions
    
    projectStats.totalTime = sessions.reduce((total, session) => total + session.totalTime, 0);
    projectStats.averageSessionDuration = sessions.length > 0 
      ? projectStats.totalTime / sessions.length 
      : 0;
    
    // Calculate active days
    const uniqueDays = new Set(sessions.map(s => formatDate(s.startTime)));
    projectStats.activeDays = uniqueDays.size;
    
    // Update last activity
    const lastSession = sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
    if (lastSession) {
      projectStats.lastActivity = lastSession.lastActivity;
    }
  }

  /**
   * Find recent session for project
   */
  private findRecentSession(projectPath: string): TimeSession | undefined {
    const projectStats = this.trackingData.projects.get(projectPath);
    if (!projectStats) {
      return undefined;
    }

    // Find most recent session that's not ended
    return projectStats.sessions
      .filter(session => !session.endTime)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
  }

  /**
   * Check if session should be resumed
   */
  private shouldResumeSession(session: TimeSession): boolean {
    const timeSinceLastActivity = Date.now() - session.lastActivity.getTime();
    const resumeThreshold = 30 * 60 * 1000; // 30 minutes
    
    return timeSinceLastActivity < resumeThreshold;
  }

  /**
   * Check if midnight has crossed and handle session splitting
   */
  private async checkAndHandleMidnightCrossing(): Promise<void> {
    if (!this.trackingData.currentSession) {
      return;
    }

    const now = new Date();
    const currentDay = now.toLocaleDateString('de-DE');
    
    // If the day has changed since the session started, we need to split the session
    if (this.lastSessionDay && this.lastSessionDay !== currentDay) {
      await this.splitSessionAtMidnight();
      this.lastSessionDay = currentDay;
    }
  }

  /**
   * Split the current session at midnight
   */
  private async splitSessionAtMidnight(): Promise<void> {
    if (!this.trackingData.currentSession) {
      return;
    }

    const currentSession = this.trackingData.currentSession;
    const now = new Date();
    
    // Create the end of yesterday (23:59:59.999)
    const endOfYesterday = new Date(now);
    endOfYesterday.setHours(0, 0, 0, 0); // Start of today
    endOfYesterday.setTime(endOfYesterday.getTime() - 1); // Subtract 1ms to get end of yesterday

    // End the current session at end of yesterday
    currentSession.endTime = endOfYesterday;
    currentSession.isActive = false;

    // Add any remaining active time up to midnight
    if (this.activityMonitor.isActive() && currentSession.lastActiveTime < endOfYesterday) {
      const remainingActiveTime = endOfYesterday.getTime() - currentSession.lastActiveTime.getTime();
      currentSession.totalTime += remainingActiveTime;
    }

    // Update project stats for the ended session
    const projectStats = this.trackingData.projects.get(currentSession.projectPath);
    if (projectStats) {
      this.recalculateProjectStats(projectStats);
    }

    this.logger.info('Session split at midnight', {
      duration: formatDetailedTime(currentSession.totalTime),
      projectName: currentSession.projectName,
      endTime: endOfYesterday.toISOString()
    });

    // Start a new session for today - but start from current time, not midnight
    const newSession: TimeSession = {
      id: this.generateSessionId(),
      projectName: currentSession.projectName,
      projectPath: currentSession.projectPath,
      startTime: now, // BUGFIX: Use current time as start, not midnight
      totalTime: 0,
      isActive: true,
      lastActivity: now,
      lastActiveTime: now, // Consistent with startTime
      textChanges: 0,
      cursorMovements: 0
    };

    // Clear the current session first
    delete this.trackingData.currentSession;
    
    // Set the new session as current
    this.trackingData.currentSession = newSession;
    this.addSessionToProject(newSession);

    // Save the data
    await this.storage.save(this.trackingData);

    this.logger.info('New session started for today', {
      projectName: newSession.projectName,
      startTime: newSession.startTime.toISOString()
    });
  }

  /**
   * Check for auto-end session after idle time
   */
  private async checkAndHandleIdleSessionEnd(): Promise<void> {
    if (!this.trackingData.currentSession) {
      return;
    }

    const now = new Date();
    const idleThreshold = this.config.autoEndIdleThreshold * 60 * 1000; // Convert minutes to milliseconds
    
    const timeSinceLastActivity = now.getTime() - this.trackingData.currentSession.lastActiveTime.getTime();
    if (timeSinceLastActivity > idleThreshold) {
      await this.endCurrentSession();
    }
  }

  /**
   * Check for project change and switch sessions if needed
   */
  private async checkAndHandleProjectChange(): Promise<void> {
    if (!this.trackingData.currentSession) {
      return;
    }

    const currentProject = this.getCurrentProject();
    if (!currentProject) {
      // No project detected, end current session
      this.logger.info('No project detected, ending current session');
      await this.endCurrentSession();
      return;
    }

    // Check if the current session is for a different project
    if (this.trackingData.currentSession.projectPath !== currentProject.path) {
      this.logger.info('Project change detected', {
        oldProject: this.trackingData.currentSession.projectName,
        newProject: currentProject.name,
        oldPath: this.trackingData.currentSession.projectPath,
        newPath: currentProject.path
      });

      // End the current session
      await this.endCurrentSession();

      // Start a new session for the new project
      await this.startOrResumeSession();
    }
  }
} 