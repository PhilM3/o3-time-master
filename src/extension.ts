/**
 * Main entry point for the O3 Time Tracker VS Code extension
 */

import * as vscode from 'vscode';
import { TimeTracker } from './timeTracker';
import { Logger } from './types';
import { TimeViewProvider, ProjectsViewProvider } from './timeViewProvider';
import { GlobalSummaryViewProvider } from './globalSummaryViewProvider';

/**
 * Simple console logger implementation
 */
class ConsoleLogger implements Logger {
  private readonly outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('O3 Time Tracker');
  }

  info(message: string, ...args: unknown[]): void {
    const formattedMessage = this.formatMessage('INFO', message, args);
    this.outputChannel.appendLine(formattedMessage);
    console.log(formattedMessage);
  }

  warn(message: string, ...args: unknown[]): void {
    const formattedMessage = this.formatMessage('WARN', message, args);
    this.outputChannel.appendLine(formattedMessage);
    console.warn(formattedMessage);
  }

  error(message: string, error?: Error, ...args: unknown[]): void {
    const formattedMessage = this.formatMessage('ERROR', message, args);
    if (error) {
      this.outputChannel.appendLine(`${formattedMessage}: ${error.message}`);
      this.outputChannel.appendLine(error.stack ?? 'No stack trace available');
    } else {
      this.outputChannel.appendLine(formattedMessage);
    }
    console.error(formattedMessage, error);
  }

  debug(message: string, ...args: unknown[]): void {
    const formattedMessage = this.formatMessage('DEBUG', message, args);
    this.outputChannel.appendLine(formattedMessage);
    console.debug(formattedMessage);
  }

  private formatMessage(level: string, message: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const argsString = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
    return `[${timestamp}] [${level}] ${message}${argsString}`;
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}

// Global extension state
let timeTracker: TimeTracker | undefined;
let logger: ConsoleLogger | undefined;
let timeViewProvider: TimeViewProvider | undefined;
let projectsViewProvider: ProjectsViewProvider | undefined;
let globalSummaryViewProvider: GlobalSummaryViewProvider | undefined;

/**
 * Called when the extension is activated
 */
export function activate(context: vscode.ExtensionContext): void {
  logger = new ConsoleLogger();
  logger.info('O3 Time Tracker extension is being activated');

  try {
    // Initialize the time tracker
    timeTracker = new TimeTracker(context, logger);

    // Initialize view providers
    timeViewProvider = new TimeViewProvider();
    projectsViewProvider = new ProjectsViewProvider();
    globalSummaryViewProvider = new GlobalSummaryViewProvider(context, logger);

    // Register tree data providers
    vscode.window.registerTreeDataProvider('o3-time-tracker.timeView', timeViewProvider);
    vscode.window.registerTreeDataProvider('o3-time-tracker.projectsView', projectsViewProvider);
    vscode.window.registerTreeDataProvider('o3-time-tracker.globalSummaryView', globalSummaryViewProvider);

    // Connect view providers to time tracker
    timeTracker.setViewProviders(timeViewProvider, projectsViewProvider);

    // Register command handlers
    registerCommands(context);

    // Setup lifecycle event handlers for session management
    setupLifecycleHandlers(context);

    // Start the time tracker
    timeTracker.start();

    logger.info('O3 Time Tracker extension activated successfully');
  } catch (error) {
    logger?.error('Failed to activate O3 Time Tracker extension', error as Error);
    vscode.window.showErrorMessage(
      'Failed to activate O3 Time Tracker extension. Check the output channel for details.'
    );
  }
}

/**
 * Called when the extension is deactivated
 */
export async function deactivate(): Promise<void> {
  logger?.info('O3 Time Tracker extension is being deactivated');

  try {
    // Stop the time tracker and clean up - ensure sessions are properly ended
    if (timeTracker) {
      await timeTracker.stop();
      timeTracker.dispose();
    }
    
    logger?.info('O3 Time Tracker extension deactivated successfully');
  } catch (error) {
    logger?.error('Error during extension deactivation', error as Error);
  } finally {
    logger?.dispose();
    timeTracker = undefined;
    logger = undefined;
    timeViewProvider = undefined;
    projectsViewProvider = undefined;
    globalSummaryViewProvider = undefined;
  }
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  if (!timeTracker) {
    throw new Error('TimeTracker not initialized');
  }

  const commands = [
    vscode.commands.registerCommand('o3-time-tracker.start', () => {
      try {
        timeTracker?.start();
        vscode.window.showInformationMessage('Time tracking started');
      } catch (error) {
        logger?.error('Failed to start time tracking', error as Error);
        vscode.window.showErrorMessage('Failed to start time tracking');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.pause', () => {
      try {
        timeTracker?.pause();
        vscode.window.showInformationMessage('Time tracking paused');
      } catch (error) {
        logger?.error('Failed to pause time tracking', error as Error);
        vscode.window.showErrorMessage('Failed to pause time tracking');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.stop', () => {
      try {
        timeTracker?.stop();
        vscode.window.showInformationMessage('Time tracking stopped');
      } catch (error) {
        logger?.error('Failed to stop time tracking', error as Error);
        vscode.window.showErrorMessage('Failed to stop time tracking');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.reset', async () => {
      try {
        const answer = await vscode.window.showWarningMessage(
          'Are you sure you want to reset the current session? This will permanently delete the current session data.',
          'Yes',
          'No'
        );

        if (answer === 'Yes') {
          timeTracker?.reset();
          vscode.window.showInformationMessage('Current session reset');
        }
      } catch (error) {
        logger?.error('Failed to reset session', error as Error);
        vscode.window.showErrorMessage('Failed to reset session');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.showStats', async () => {
      try {
        await timeTracker?.showStatistics();
      } catch (error) {
        logger?.error('Failed to show statistics', error as Error);
        vscode.window.showErrorMessage('Failed to show statistics');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.export', async () => {
      try {
        await timeTracker?.exportData();
      } catch (error) {
        logger?.error('Failed to export data', error as Error);
        vscode.window.showErrorMessage('Failed to export data');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.showQuickPick', async () => {
      try {
        await timeTracker?.showStatistics();
      } catch (error) {
        logger?.error('Failed to show quick pick menu', error as Error);
        vscode.window.showErrorMessage('Failed to show quick pick menu');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.showDetailedTimeLog', async () => {
      try {
        await timeTracker?.showDetailedTimeLog();
      } catch (error) {
        logger?.error('Failed to show detailed time log', error as Error);
        vscode.window.showErrorMessage('Failed to show detailed time log');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.showTodaysSessions', async () => {
      try {
        await timeTracker?.showTodaysSessions();
      } catch (error) {
        logger?.error('Failed to show today\'s sessions', error as Error);
        vscode.window.showErrorMessage('Failed to show today\'s sessions');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.refreshTimeView', () => {
      timeViewProvider?.refresh();
      projectsViewProvider?.refresh();
    }),

    vscode.commands.registerCommand('o3-time-tracker.refreshGlobalSummary', async () => {
      try {
        await globalSummaryViewProvider?.forceRefresh();
        vscode.window.showInformationMessage('Globale Zusammenfassung aktualisiert');
      } catch (error) {
        logger?.error('Failed to refresh global summary', error as Error);
        vscode.window.showErrorMessage('Fehler beim Aktualisieren der globalen Zusammenfassung');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.startFromView', async () => {
      try {
        await timeTracker?.start();
        vscode.window.showInformationMessage('Time tracking started');
      } catch (error) {
        logger?.error('Failed to start time tracking from view', error as Error);
        vscode.window.showErrorMessage('Failed to start time tracking');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.pauseFromView', () => {
      try {
        timeTracker?.pause();
        vscode.window.showInformationMessage('Time tracking paused');
      } catch (error) {
        logger?.error('Failed to pause time tracking from view', error as Error);
        vscode.window.showErrorMessage('Failed to pause time tracking');
      }
    }),

    vscode.commands.registerCommand('o3-time-tracker.stopFromView', async () => {
      try {
        await timeTracker?.stop();
        vscode.window.showInformationMessage('Time tracking stopped');
      } catch (error) {
        logger?.error('Failed to stop time tracking from view', error as Error);
        vscode.window.showErrorMessage('Failed to stop time tracking');
      }
    })
  ];

  // Add all commands to the extension context for proper disposal
  commands.forEach(command => context.subscriptions.push(command));

  logger?.info(`Registered ${commands.length} commands`);
}

/**
 * Setup lifecycle event handlers for better session management
 */
function setupLifecycleHandlers(context: vscode.ExtensionContext): void {
  if (!timeTracker || !logger) {
    return;
  }

  try {
    // Handle process exit events
    const handleProcessExit = async () => {
      logger?.info('Process exit detected - stopping time tracker');
      try {
        await timeTracker?.stop();
      } catch (error) {
        logger?.error('Error stopping time tracker during process exit', error as Error);
      }
    };

    // Register process exit handlers
    process.on('exit', handleProcessExit);
    process.on('SIGINT', handleProcessExit);
    process.on('SIGTERM', handleProcessExit);
    process.on('beforeExit', handleProcessExit);

    // Handle window state changes for better focus tracking
    context.subscriptions.push(
      vscode.window.onDidChangeWindowState(async (windowState) => {
        if (!windowState.focused) {
          logger?.debug('Window lost focus');
          // The activity monitor will handle this, but we log it for debugging
        } else {
          logger?.debug('Window gained focus');
        }
      })
    );

    // Clean up process handlers when extension is deactivated
    context.subscriptions.push({
      dispose: () => {
        process.removeListener('exit', handleProcessExit);
        process.removeListener('SIGINT', handleProcessExit);
        process.removeListener('SIGTERM', handleProcessExit);
        process.removeListener('beforeExit', handleProcessExit);
      }
    });

    logger.info('Lifecycle handlers setup completed');
  } catch (error) {
    logger.error('Failed to setup lifecycle handlers', error as Error);
  }
} 