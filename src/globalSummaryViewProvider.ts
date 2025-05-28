/**
 * Global Summary View Provider for displaying aggregated data from all workspaces
 */

import * as vscode from 'vscode';
import { CrossWorkspaceManager, AggregatedData } from './crossWorkspaceManager';
import { Logger, ProjectStats } from './types';
import { 
  formatDetailedTime,
  getCurrentWeekStart,
  getCurrentWeekEnd,
  getCurrentMonthStart,
  getCurrentMonthEnd,
  getTodayStart,
  getTodayEnd,
  calculateSessionTimeInRange
} from './timeUtils';

export class GlobalSummaryItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: string,
    tooltip?: string,
    description?: string,
    iconPath?: vscode.ThemeIcon,
    public readonly projectKey?: string,  // Für Projekte
    public readonly date?: string         // Für Tage (YYYY-MM-DD Format)
  ) {
    super(label, collapsibleState);
    if (tooltip) {
      this.tooltip = tooltip;
    }
    if (description) {
      this.description = description;
    }
    this.contextValue = itemType;
    if (iconPath) {
      this.iconPath = iconPath;
    }
  }
}

export class GlobalSummaryViewProvider implements vscode.TreeDataProvider<GlobalSummaryItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<GlobalSummaryItem | undefined | null | void> = 
    new vscode.EventEmitter<GlobalSummaryItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<GlobalSummaryItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private crossWorkspaceManager: CrossWorkspaceManager;
  private logger: Logger;

  constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.logger = logger;
    this.crossWorkspaceManager = new CrossWorkspaceManager(context, logger);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async forceRefresh(): Promise<void> {
    await this.crossWorkspaceManager.refreshCache();
    this.refresh();
  }

  getTreeItem(element: GlobalSummaryItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GlobalSummaryItem): Promise<GlobalSummaryItem[]> {
    try {
      const aggregatedData = await this.crossWorkspaceManager.getAggregatedData();

      if (!element) {
        return this.getRootItems(aggregatedData);
      }

      if (element.itemType === 'all-workspaces') {
        return this.getWorkspaceItems(aggregatedData);
      } else if (element.itemType === 'all-projects') {
        return this.getAllProjectItems(aggregatedData);
      } else if (element.itemType === 'today-summary') {
        return this.getTodaySummaryItems(aggregatedData);
      } else if (element.itemType === 'week-summary') {
        return this.getWeekSummaryItems(aggregatedData);
      } else if (element.itemType === 'month-summary') {
        return this.getMonthSummaryItems(aggregatedData);
      } else if (element.itemType === 'week-project') {
        return this.getWeekProjectDayItems(aggregatedData, element.projectKey || '');
      } else if (element.itemType === 'month-project') {
        return this.getMonthProjectWeekItems(aggregatedData, element.projectKey || '');
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to get global summary children', error as Error);
      return [
        new GlobalSummaryItem(
          'Fehler beim Laden',
          vscode.TreeItemCollapsibleState.None,
          'error',
          'Fehler beim Laden der globalen Zusammenfassung'
        )
      ];
    }
  }

  private getRootItems(data: AggregatedData): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];

    // Global Summary
    items.push(new GlobalSummaryItem(
      'Globale Zusammenfassung',
      vscode.TreeItemCollapsibleState.Expanded,
      'global-summary',
      `${data.workspaceCount} Workspaces - ${data.allProjects.size} Projekte - ${formatDetailedTime(data.totalTime)}`,
      formatDetailedTime(data.totalTime),
      new vscode.ThemeIcon('globe', new vscode.ThemeColor('charts.blue'))
    ));

    // Today's Summary across all workspaces
    const todayTime = this.getTodayTotalTime(data);
    items.push(new GlobalSummaryItem(
      'Heute (Alle Projekte)',
      vscode.TreeItemCollapsibleState.Collapsed,
      'today-summary',
      `Heutige Arbeitszeit über alle Projekte: ${formatDetailedTime(todayTime)}`,
      formatDetailedTime(todayTime),
      new vscode.ThemeIcon('calendar')
    ));

    // This Week's Summary across all workspaces
    const weekTime = this.getWeekTotalTime(data);
    items.push(new GlobalSummaryItem(
      'Diese Woche (Alle Projekte)',
      vscode.TreeItemCollapsibleState.Collapsed,
      'week-summary',
      `Arbeitszeit diese Woche über alle Projekte: ${formatDetailedTime(weekTime)}`,
      formatDetailedTime(weekTime),
      new vscode.ThemeIcon('calendar')
    ));

    // This Month's Summary across all workspaces
    const monthTime = this.getMonthTotalTime(data);
    items.push(new GlobalSummaryItem(
      'Dieser Monat (Alle Projekte)',
      vscode.TreeItemCollapsibleState.Collapsed,
      'month-summary',
      `Arbeitszeit diesen Monat über alle Projekte: ${formatDetailedTime(monthTime)}`,
      formatDetailedTime(monthTime),
      new vscode.ThemeIcon('calendar')
    ));

    // All Workspaces
    if (data.workspaceCount > 0) {
      items.push(new GlobalSummaryItem(
        `Alle Workspaces (${data.workspaceCount})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'all-workspaces',
        `${data.workspaceCount} Workspaces mit Tracking-Daten`,
        undefined,
        new vscode.ThemeIcon('folder-library')
      ));
    }

    // All Projects
    if (data.allProjects.size > 0) {
      items.push(new GlobalSummaryItem(
        `Alle Projekte (${data.allProjects.size})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        'all-projects',
        `${data.allProjects.size} Projekte über alle Workspaces`,
        undefined,
        new vscode.ThemeIcon('project')
      ));
    }

    // Last Updated
    items.push(new GlobalSummaryItem(
      `Aktualisiert: ${data.lastUpdated.toLocaleTimeString('de-DE')}`,
      vscode.TreeItemCollapsibleState.None,
      'last-updated',
      'Zeitpunkt der letzten Datenaktualisierung',
      undefined,
      new vscode.ThemeIcon('sync')
    ));

    return items;
  }

  private getWorkspaceItems(data: AggregatedData): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];

    data.workspaces
      .sort((a, b) => b.data.totalTimeTracked - a.data.totalTimeTracked)
      .forEach(workspace => {
        const projectCount = workspace.data.projects.size;
        const totalTime = workspace.data.totalTimeTracked;
        
        items.push(new GlobalSummaryItem(
          workspace.name,
          vscode.TreeItemCollapsibleState.None,
          'workspace',
          `${formatDetailedTime(totalTime)} - ${projectCount} Projekte`,
          formatDetailedTime(totalTime),
          new vscode.ThemeIcon('folder')
        ));
      });

    return items;
  }

  private getAllProjectItems(data: AggregatedData): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];

    const projects = Array.from(data.allProjects.values())
      .sort((a, b) => b.totalTime - a.totalTime);

    projects.forEach(project => {
      const lastActivity = project.lastActivity.toLocaleDateString('de-DE');
      
      items.push(new GlobalSummaryItem(
        project.projectName,
        vscode.TreeItemCollapsibleState.None,
        'global-project',
        `${formatDetailedTime(project.totalTime)} - ${project.sessions.length} Sessions - Zuletzt: ${lastActivity}`,
        formatDetailedTime(project.totalTime),
        new vscode.ThemeIcon('folder')
      ));
    });

    return items;
  }

  private getTodaySummaryItems(data: AggregatedData): GlobalSummaryItem[] {
    const todayStart = getTodayStart();
    const todayEnd = getTodayEnd();
    
    return this.getSummaryItemsForDateRange(data, todayStart, todayEnd, 'workspace-today');
  }

  private getWeekSummaryItems(data: AggregatedData): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];
    const weekProjects = this.getWeekProjectsAggregated(data);

    // Sort projects by total week time (descending)
    const sortedProjects = Array.from(weekProjects.values())
      .sort((a, b) => b.totalWeekTime - a.totalWeekTime);

    sortedProjects.forEach(({ project, totalWeekTime, projectKey }) => {
      items.push(new GlobalSummaryItem(
        project.projectName,
        vscode.TreeItemCollapsibleState.Collapsed,
        'week-project',
        `${formatDetailedTime(totalWeekTime)} diese Woche - ${project.sessions.length} Sessions total`,
        formatDetailedTime(totalWeekTime),
        new vscode.ThemeIcon('folder'),
        projectKey
      ));
    });

    return items;
  }

  private getMonthSummaryItems(data: AggregatedData): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];
    const monthProjects = this.getMonthProjectsAggregated(data);

    // Sort projects by total month time (descending)
    const sortedProjects = Array.from(monthProjects.values())
      .sort((a, b) => b.totalMonthTime - a.totalMonthTime);

    sortedProjects.forEach(({ project, totalMonthTime, projectKey }) => {
      items.push(new GlobalSummaryItem(
        project.projectName,
        vscode.TreeItemCollapsibleState.Collapsed,
        'month-project',
        `${formatDetailedTime(totalMonthTime)} diesen Monat - ${project.sessions.length} Sessions total`,
        formatDetailedTime(totalMonthTime),
        new vscode.ThemeIcon('folder'),
        projectKey
      ));
    });

    return items;
  }

  private getSummaryItemsForDateRange(data: AggregatedData, rangeStart: Date, rangeEnd: Date, contextValue: string): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];

    data.workspaces.forEach(workspace => {
      let workspaceRangeTime = 0;
      let sessionCount = 0;

      // Calculate time for this workspace in the date range
      workspace.data.projects.forEach(project => {
        project.sessions.forEach(session => {
          if (session.endTime) {
            // Only count completed sessions to avoid double counting with current session
            const sessionTime = calculateSessionTimeInRange(
              session.startTime,
              session.totalTime,
              rangeStart,
              rangeEnd
            );
            if (sessionTime > 0) {
              workspaceRangeTime += sessionTime;
            sessionCount++;
            }
          }
        });
      });

      // Add current session if it overlaps with the date range
      if (workspace.data.currentSession) {
        const currentSessionTime = calculateSessionTimeInRange(
          workspace.data.currentSession.startTime,
          workspace.data.currentSession.totalTime,
          rangeStart,
          rangeEnd
        );
        if (currentSessionTime > 0) {
          workspaceRangeTime += currentSessionTime;
          sessionCount++;
        }
      }

      if (workspaceRangeTime > 0) {
        const timeDesc = contextValue === 'workspace-today' ? 'heute' :
                        contextValue === 'workspace-week' ? 'diese Woche' : 'diesen Monat';
        
        items.push(new GlobalSummaryItem(
          workspace.name,
          vscode.TreeItemCollapsibleState.None,
          contextValue,
          `${formatDetailedTime(workspaceRangeTime)} - ${sessionCount} Sessions ${timeDesc}`,
          formatDetailedTime(workspaceRangeTime),
          new vscode.ThemeIcon('calendar')
        ));
      }
    });

    // Sort by time in range
    items.sort((a, b) => {
      const descA = typeof a.description === 'string' ? a.description : '';
      const descB = typeof b.description === 'string' ? b.description : '';
      const timeA = this.extractTimeFromDescription(descA);
      const timeB = this.extractTimeFromDescription(descB);
      return timeB - timeA;
    });

    return items;
  }

  private getTodayTotalTime(data: AggregatedData): number {
    const todayStart = getTodayStart();
    const todayEnd = getTodayEnd();
    
    return this.getTimeInDateRange(data, todayStart, todayEnd);
  }

  private getWeekTotalTime(data: AggregatedData): number {
    const weekStart = getCurrentWeekStart();
    const weekEnd = getCurrentWeekEnd();
    
    return this.getTimeInDateRange(data, weekStart, weekEnd);
  }

  private getMonthTotalTime(data: AggregatedData): number {
    const monthStart = getCurrentMonthStart();
    const monthEnd = getCurrentMonthEnd();
    
    return this.getTimeInDateRange(data, monthStart, monthEnd);
  }

  private getTimeInDateRange(data: AggregatedData, rangeStart: Date, rangeEnd: Date): number {
    let totalTime = 0;

    data.workspaces.forEach(workspace => {
      workspace.data.projects.forEach(project => {
        project.sessions.forEach(session => {
          if (session.endTime) {
            // Only count completed sessions to avoid double counting with current session
            totalTime += calculateSessionTimeInRange(
              session.startTime,
              session.totalTime,
              rangeStart,
              rangeEnd
            );
          }
        });
      });

      // Add current session if it overlaps with the date range
      if (workspace.data.currentSession) {
        totalTime += calculateSessionTimeInRange(
          workspace.data.currentSession.startTime,
          workspace.data.currentSession.totalTime,
          rangeStart,
          rangeEnd
        );
      }
    });

    return totalTime;
  }

  private extractTimeFromDescription(_description: string): number {
    // Simple helper to extract time for sorting
    // This is a simplified implementation - could be enhanced to parse actual time values
    return 0;
  }

  /**
   * Get German weekday name for a given date
   */
  private getGermanWeekday(date: Date): string {
    const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return weekdays[date.getDay()] || 'Unbekannt';
  }

  /**
   * Get all days of the current week as Date objects
   */
  private getWeekDays(): Date[] {
    const weekStart = getCurrentWeekStart();
    const days: Date[] = [];
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      days.push(day);
    }
    
    return days;
  }

  /**
   * Calculate time spent on a project for a specific day
   */
  private getProjectTimeForDay(project: ProjectStats, date: Date, data: AggregatedData, projectKey: string): number {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    let totalTime = 0;

    // Calculate time from all sessions (completed and ongoing)
    project.sessions.forEach(session => {
      if (session.endTime) {
        // Completed sessions
        totalTime += calculateSessionTimeInRange(
          session.startTime,
          session.totalTime,
          dayStart,
          dayEnd
        );
      } else {
        // Ongoing sessions without endTime - calculate time if they started today
        const sessionStart = new Date(session.startTime);
        if (sessionStart >= dayStart && sessionStart <= dayEnd) {
          totalTime += session.totalTime;
        }
      }
    });

    // Add current session if it's for this project and on this day
    const workspaceName = projectKey.split(':')[0];
    const projectPath = projectKey.split(':')[1];
    
    if (workspaceName && projectPath) {
      const workspace = data.workspaces.find(w => w.name === workspaceName);
      if (workspace?.data.currentSession && 
          workspace.data.currentSession.projectPath === projectPath) {
        totalTime += calculateSessionTimeInRange(
          workspace.data.currentSession.startTime,
          workspace.data.currentSession.totalTime,
          dayStart,
          dayEnd
        );
      }
    }

    return totalTime;
  }

  /**
   * Get aggregated project data from all workspaces for the current week
   */
  private getWeekProjectsAggregated(data: AggregatedData): Map<string, { project: ProjectStats; totalWeekTime: number; projectKey: string }> {
    const weekStart = getCurrentWeekStart();
    const weekEnd = getCurrentWeekEnd();
    const projectsMap = new Map<string, { project: ProjectStats; totalWeekTime: number; projectKey: string }>();

    data.workspaces.forEach(workspace => {
      workspace.data.projects.forEach((project, projectPath) => {
        // Create a unique key for the project
        const projectKey = `${workspace.name}:${projectPath}`;
        
        // Calculate total time for this project in the current week
        let weekTime = 0;
        
        project.sessions.forEach(session => {
          if (session.endTime) {
            weekTime += calculateSessionTimeInRange(
              session.startTime,
              session.totalTime,
              weekStart,
              weekEnd
            );
          }
        });

        // Add current session if it's for this project and overlaps with the week
        if (workspace.data.currentSession && 
            workspace.data.currentSession.projectPath === projectPath) {
          weekTime += calculateSessionTimeInRange(
            workspace.data.currentSession.startTime,
            workspace.data.currentSession.totalTime,
            weekStart,
            weekEnd
          );
        }

        if (weekTime > 0) {
          projectsMap.set(projectKey, {
            project,
            totalWeekTime: weekTime,
            projectKey
          });
        }
      });
    });

    return projectsMap;
  }

  /**
   * Get day items for a specific project in the current week
   */
  private getWeekProjectDayItems(data: AggregatedData, projectKey: string): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];
    const weekDays = this.getWeekDays();
    
    // Find the project data
    const weekProjects = this.getWeekProjectsAggregated(data);
    const projectData = weekProjects.get(projectKey);
    
    if (!projectData) {
      return items;
    }

    const { project } = projectData;

    weekDays.forEach(day => {
      const dayTime = this.getProjectTimeForDay(project, day, data, projectKey);
      
      if (dayTime > 0) {
        const weekdayName = this.getGermanWeekday(day);
        const dateStr = day.toLocaleDateString('de-DE');
        
        items.push(new GlobalSummaryItem(
          `${weekdayName}, ${dateStr}`,
          vscode.TreeItemCollapsibleState.None,
          'week-project-day',
          `${formatDetailedTime(dayTime)} am ${weekdayName}`,
          formatDetailedTime(dayTime),
          new vscode.ThemeIcon('calendar'),
          projectKey,
          day.toISOString().split('T')[0] // YYYY-MM-DD format
        ));
      }
    });

    return items;
  }

  /**
   * Get aggregated project data from all workspaces for the current month
   */
  private getMonthProjectsAggregated(data: AggregatedData): Map<string, { project: ProjectStats; totalMonthTime: number; projectKey: string }> {
    const monthStart = getCurrentMonthStart();
    const monthEnd = getCurrentMonthEnd();
    const projectsMap = new Map<string, { project: ProjectStats; totalMonthTime: number; projectKey: string }>();

    data.workspaces.forEach(workspace => {
      workspace.data.projects.forEach((project, projectPath) => {
        // Create a unique key for the project
        const projectKey = `${workspace.name}:${projectPath}`;
        
        // Calculate total time for this project in the current month
        let monthTime = 0;
        
        project.sessions.forEach(session => {
          if (session.endTime) {
            monthTime += calculateSessionTimeInRange(
              session.startTime,
              session.totalTime,
              monthStart,
              monthEnd
            );
          }
        });

        // Add current session if it's for this project and overlaps with the month
        if (workspace.data.currentSession && 
            workspace.data.currentSession.projectPath === projectPath) {
          monthTime += calculateSessionTimeInRange(
            workspace.data.currentSession.startTime,
            workspace.data.currentSession.totalTime,
            monthStart,
            monthEnd
          );
        }

        if (monthTime > 0) {
          projectsMap.set(projectKey, {
            project,
            totalMonthTime: monthTime,
            projectKey
          });
        }
      });
    });

    return projectsMap;
  }

  /**
   * Get all weeks that overlap with the current month
   */
  private getMonthWeeks(): Array<{ weekStart: Date; weekEnd: Date; weekNumber: number }> {
    const monthStart = getCurrentMonthStart();
    const monthEnd = getCurrentMonthEnd();
    const weeks: Array<{ weekStart: Date; weekEnd: Date; weekNumber: number }> = [];

    // Start from the first Monday of the month or before
    const firstDay = new Date(monthStart);
    const dayOfWeek = firstDay.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    let currentWeekStart = new Date(firstDay);
    currentWeekStart.setDate(firstDay.getDate() + daysToMonday);
    currentWeekStart.setHours(0, 0, 0, 0);

    while (currentWeekStart <= monthEnd) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Only include weeks that actually overlap with the month
      if (weekEnd >= monthStart) {
        const weekNumber = this.getWeekOfYear(currentWeekStart);
        weeks.push({
          weekStart: new Date(currentWeekStart),
          weekEnd: new Date(weekEnd),
          weekNumber
        });
      }

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    return weeks;
  }

  /**
   * Get ISO week number for a given date
   */
  private getWeekOfYear(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Calculate time spent on a project for a specific week
   */
  private getProjectTimeForWeek(project: ProjectStats, weekStart: Date, weekEnd: Date, data: AggregatedData, projectKey: string): number {
    let totalTime = 0;

    // Calculate time from all sessions (completed and ongoing)
    project.sessions.forEach(session => {
      if (session.endTime) {
        // Completed sessions
        totalTime += calculateSessionTimeInRange(
          session.startTime,
          session.totalTime,
          weekStart,
          weekEnd
        );
      } else {
        // Ongoing sessions without endTime - calculate time if they started in this week
        const sessionStart = new Date(session.startTime);
        if (sessionStart >= weekStart && sessionStart <= weekEnd) {
          totalTime += session.totalTime;
        }
      }
    });

    // Add current session if it's for this project and in this week
    const workspaceName = projectKey.split(':')[0];
    const projectPath = projectKey.split(':')[1];
    
    if (workspaceName && projectPath) {
      const workspace = data.workspaces.find(w => w.name === workspaceName);
      if (workspace?.data.currentSession && 
          workspace.data.currentSession.projectPath === projectPath) {
        totalTime += calculateSessionTimeInRange(
          workspace.data.currentSession.startTime,
          workspace.data.currentSession.totalTime,
          weekStart,
          weekEnd
        );
      }
    }

    return totalTime;
  }

  /**
   * Get week items for a specific project in the current month
   */
  private getMonthProjectWeekItems(data: AggregatedData, projectKey: string): GlobalSummaryItem[] {
    const items: GlobalSummaryItem[] = [];
    const monthWeeks = this.getMonthWeeks();
    
    // Find the project data
    const monthProjects = this.getMonthProjectsAggregated(data);
    const projectData = monthProjects.get(projectKey);
    
    if (!projectData) {
      return items;
    }

    const { project } = projectData;

    monthWeeks.forEach(({ weekStart, weekEnd, weekNumber }) => {
      const weekTime = this.getProjectTimeForWeek(project, weekStart, weekEnd, data, projectKey);
      
      if (weekTime > 0) {
        const weekStartStr = weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        const weekEndStr = weekEnd.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        
        items.push(new GlobalSummaryItem(
          `KW ${weekNumber}: ${weekStartStr} - ${weekEndStr}`,
          vscode.TreeItemCollapsibleState.None,
          'month-project-week',
          `${formatDetailedTime(weekTime)} in KW ${weekNumber}`,
          formatDetailedTime(weekTime),
          new vscode.ThemeIcon('calendar'),
          projectKey,
          `${weekStart.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}` // ISO week format
        ));
      }
    });

    return items;
  }
} 