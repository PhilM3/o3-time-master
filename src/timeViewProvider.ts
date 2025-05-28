/**
 * Tree View Provider for displaying time tracking data in the Primary Sidebar
 */

import * as vscode from 'vscode';
import { TrackingData, TimeSession } from './types';
import { formatDetailedTime } from './timeUtils';

export class TimeViewItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: string,
    tooltip?: string,
    description?: string,
    iconPath?: vscode.ThemeIcon
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

export class TimeViewProvider implements vscode.TreeDataProvider<TimeViewItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TimeViewItem | undefined | null | void> = new vscode.EventEmitter<TimeViewItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TimeViewItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private trackingData: TrackingData | undefined;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateData(data: TrackingData): void {
    this.trackingData = data;
    this.refresh();
  }

  getTreeItem(element: TimeViewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TimeViewItem): Thenable<TimeViewItem[]> {
    if (!this.trackingData) {
      return Promise.resolve([
        new TimeViewItem(
          'Keine Daten verfügbar',
          vscode.TreeItemCollapsibleState.None,
          'no-data',
          'Starten Sie das Tracking, um Daten zu sehen'
        )
      ]);
    }

    if (!element) {
      return Promise.resolve(this.getRootItems());
    }

    if (element.itemType === 'current-session') {
      return Promise.resolve(this.getCurrentSessionDetails());
    } else if (element.itemType === 'today-sessions') {
      return Promise.resolve(this.getTodaySessionItems());
    } else if (element.itemType === 'recent-sessions') {
      return Promise.resolve(this.getRecentSessionItems());
    }

    return Promise.resolve([]);
  }

  private getRootItems(): TimeViewItem[] {
    const items: TimeViewItem[] = [];

    // Current Session
    if (this.trackingData?.currentSession) {
      // Use totalTime to show only active work time, not idle time
      const sessionTime = this.trackingData.currentSession.totalTime;
      const startTime = this.trackingData.currentSession.startTime.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      });

      items.push(new TimeViewItem(
        'Aktuelle Session',
        vscode.TreeItemCollapsibleState.Expanded,
        'current-session',
        `${this.trackingData.currentSession.projectName} - ${formatDetailedTime(sessionTime)}`,
        `${startTime} - ${formatDetailedTime(sessionTime)}`,
        new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'))
      ));
    } else {
      items.push(new TimeViewItem(
        'Keine aktive Session',
        vscode.TreeItemCollapsibleState.None,
        'no-session',
        'Klicken Sie auf Start, um das Tracking zu beginnen',
        'Bereit',
        new vscode.ThemeIcon('circle-outline')
      ));
    }

    // Today's Summary
    const todayTime = this.getTodayTotalTime();
    const todaySessionCount = this.getTodaySessionCount();
    
    items.push(new TimeViewItem(
      'Heute',
      vscode.TreeItemCollapsibleState.Collapsed,
      'today-sessions',
      `${todaySessionCount} Sessions - ${formatDetailedTime(todayTime)}`,
      formatDetailedTime(todayTime),
      new vscode.ThemeIcon('calendar')
    ));

    // Recent Sessions
    items.push(new TimeViewItem(
      'Letzte Sessions',
      vscode.TreeItemCollapsibleState.Collapsed,
      'recent-sessions',
      'Die letzten 5 abgeschlossenen Sessions',
      undefined,
      new vscode.ThemeIcon('history')
    ));

    return items;
  }

  private getCurrentSessionDetails(): TimeViewItem[] {
    if (!this.trackingData?.currentSession) {
      return [];
    }

    const session = this.trackingData.currentSession;
    const items: TimeViewItem[] = [];

    items.push(new TimeViewItem(
      session.projectName,
      vscode.TreeItemCollapsibleState.None,
      'session-project',
      `Projekt: ${session.projectName}`,
      'Projekt',
      new vscode.ThemeIcon('folder')
    ));

    const startTime = session.startTime.toLocaleTimeString('de-DE');
    items.push(new TimeViewItem(
      `Gestartet: ${startTime}`,
      vscode.TreeItemCollapsibleState.None,
      'session-start',
      `Session gestartet um ${startTime}`,
      undefined,
      new vscode.ThemeIcon('clock')
    ));

    items.push(new TimeViewItem(
      `${session.textChanges} Textänderungen`,
      vscode.TreeItemCollapsibleState.None,
      'session-text',
      'Anzahl der Textänderungen in dieser Session',
      undefined,
      new vscode.ThemeIcon('edit')
    ));

    items.push(new TimeViewItem(
      `${session.cursorMovements} Cursor-Bewegungen`,
      vscode.TreeItemCollapsibleState.None,
      'session-cursor',
      'Anzahl der Cursor-Bewegungen in dieser Session',
      undefined,
      new vscode.ThemeIcon('arrow-right')
    ));

    return items;
  }

  private getTodaySessionItems(): TimeViewItem[] {
    if (!this.trackingData) {
      return [];
    }

    const today = new Date().toLocaleDateString('de-DE');
    const items: TimeViewItem[] = [];

    // Add current session if it's from today
    if (this.trackingData.currentSession) {
      const sessionDate = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
      if (sessionDate === today) {
        // Use totalTime to show only active work time, not idle time
        const sessionTime = this.trackingData.currentSession.totalTime;
        const startTime = this.trackingData.currentSession.startTime.toLocaleTimeString('de-DE', {
          hour: '2-digit',
          minute: '2-digit'
        });

        items.push(new TimeViewItem(
          `${startTime} - läuft`,
          vscode.TreeItemCollapsibleState.None,
          'today-current',
          `${this.trackingData.currentSession.projectName} - ${formatDetailedTime(sessionTime)}`,
          formatDetailedTime(sessionTime),
          new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'))
        ));
      }
    }

    // Add completed sessions from today
    this.trackingData.projects.forEach(project => {
      project.sessions.forEach(session => {
        const sessionDate = session.startTime.toLocaleDateString('de-DE');
        if (sessionDate === today && session.endTime) {
          const startTime = session.startTime.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const endTime = session.endTime.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
          });

          items.push(new TimeViewItem(
            `${startTime} - ${endTime}`,
            vscode.TreeItemCollapsibleState.None,
            'today-completed',
            `${project.projectName} - ${formatDetailedTime(session.totalTime)}`,
            formatDetailedTime(session.totalTime),
            new vscode.ThemeIcon('check-all')
          ));
        }
      });
    });

    if (items.length === 0) {
      items.push(new TimeViewItem(
        'Heute noch keine Sessions',
        vscode.TreeItemCollapsibleState.None,
        'no-today-sessions',
        'Starten Sie das Tracking, um heutige Sessions zu sehen',
        undefined,
        new vscode.ThemeIcon('info')
      ));
    }

    return items;
  }

  private getRecentSessionItems(): TimeViewItem[] {
    if (!this.trackingData) {
      return [];
    }

    const allSessions: Array<{ session: TimeSession; projectName: string }> = [];

    this.trackingData.projects.forEach(project => {
      project.sessions.forEach(session => {
        if (session.endTime) {
          allSessions.push({ session, projectName: project.projectName });
        }
      });
    });

    allSessions.sort((a, b) => {
      const endA = a.session.endTime?.getTime() || 0;
      const endB = b.session.endTime?.getTime() || 0;
      return endB - endA;
    });

    const recentSessions = allSessions.slice(0, 5);
    const items: TimeViewItem[] = [];

    recentSessions.forEach(({ session, projectName }) => {
      const date = session.startTime.toLocaleDateString('de-DE');
      const startTime = session.startTime.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const endTime = session.endTime?.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      });

      items.push(new TimeViewItem(
        `${date} ${startTime}-${endTime}`,
        vscode.TreeItemCollapsibleState.None,
        'recent-session',
        `${projectName} - ${formatDetailedTime(session.totalTime)}`,
        formatDetailedTime(session.totalTime),
        new vscode.ThemeIcon('history')
      ));
    });

    if (items.length === 0) {
      items.push(new TimeViewItem(
        'Keine Sessions verfügbar',
        vscode.TreeItemCollapsibleState.None,
        'no-recent-sessions',
        'Starten Sie das Tracking, um Sessions zu sehen',
        undefined,
        new vscode.ThemeIcon('info')
      ));
    }

    return items;
  }

  private getTodayTotalTime(): number {
    if (!this.trackingData) {
      return 0;
    }

    const today = new Date().toLocaleDateString('de-DE');
    let totalTime = 0;

    // Add current session time (use totalTime to show only active work time)
    if (this.trackingData.currentSession) {
      const sessionDate = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
      if (sessionDate === today) {
        totalTime += this.trackingData.currentSession.totalTime;
      }
    }

    // Add completed sessions from today
    this.trackingData.projects.forEach(project => {
      project.sessions.forEach(session => {
        const sessionDate = session.startTime.toLocaleDateString('de-DE');
        if (sessionDate === today && session.endTime) {
          // Only count completed sessions to avoid double counting with current session
          totalTime += session.totalTime;
        }
      });
    });

    return totalTime;
  }

  private getTodaySessionCount(): number {
    if (!this.trackingData) {
      return 0;
    }

    const today = new Date().toLocaleDateString('de-DE');
    let count = 0;

    if (this.trackingData.currentSession) {
      const sessionDate = this.trackingData.currentSession.startTime.toLocaleDateString('de-DE');
      if (sessionDate === today) {
        count++;
      }
    }

    this.trackingData.projects.forEach(project => {
      project.sessions.forEach(session => {
        const sessionDate = session.startTime.toLocaleDateString('de-DE');
        if (sessionDate === today) {
          count++;
        }
      });
    });

    return count;
  }
}

export class ProjectsViewProvider implements vscode.TreeDataProvider<TimeViewItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TimeViewItem | undefined | null | void> = new vscode.EventEmitter<TimeViewItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TimeViewItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private trackingData: TrackingData | undefined;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateData(data: TrackingData): void {
    this.trackingData = data;
    this.refresh();
  }

  getTreeItem(element: TimeViewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TimeViewItem): Thenable<TimeViewItem[]> {
    if (!this.trackingData) {
      return Promise.resolve([
        new TimeViewItem(
          'Keine Projekte verfügbar',
          vscode.TreeItemCollapsibleState.None,
          'no-projects',
          'Starten Sie das Tracking, um Projekte zu sehen'
        )
      ]);
    }

    if (!element) {
      return Promise.resolve(this.getProjectItems());
    }

    return Promise.resolve([]);
  }

  private getProjectItems(): TimeViewItem[] {
    if (!this.trackingData) {
      return [];
    }

    const projects = Array.from(this.trackingData.projects.values())
      .sort((a, b) => b.totalTime - a.totalTime);

    const items: TimeViewItem[] = [];

    projects.forEach(project => {
      const lastActivity = project.lastActivity.toLocaleDateString('de-DE');
      
      items.push(new TimeViewItem(
        project.projectName,
        vscode.TreeItemCollapsibleState.None,
        'project',
        `${formatDetailedTime(project.totalTime)} - ${project.sessions.length} Sessions - Zuletzt: ${lastActivity}`,
        formatDetailedTime(project.totalTime),
        new vscode.ThemeIcon('folder')
      ));
    });

    if (items.length === 0) {
      items.push(new TimeViewItem(
        'Keine Projekte verfügbar',
        vscode.TreeItemCollapsibleState.None,
        'no-projects',
        'Starten Sie das Tracking, um Projekte zu sehen',
        undefined,
        new vscode.ThemeIcon('info')
      ));
    }

    return items;
  }
} 