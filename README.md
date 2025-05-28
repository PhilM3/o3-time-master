# o3-time-master

A VS Code extension for automatic time tracking with intelligent activity detection and project-based tracking.

## ✨ Features

- **Automatic Time Tracking**: Smart activity detection with auto start/pause
- **Sleep/Wake Detection**: Automatically pauses when laptop sleeps and resumes on wake
- **Project-Based Tracking**: Separate time tracking for different workspaces
- **Real-time Sidebar**: Live overview of current session and daily summary
- **Detailed Reports**: Work session logs with start/end times and activity counters
- **Local Data Storage**: All data stored locally in JSON format
- **Background Tracking**: Works with Cursor Agent and other automated activities

## 🚀 Installation

1. Install from VS Code Marketplace: `O3 Time Tracker`
2. Extension starts automatically when opening VS Code

## 📱 Usage

### Primary Sidebar
Click the clock icon (⏰) in the Activity Bar to access:
- ▶️ Start/⏸️ Pause/⏹️ Stop buttons
- Current session timer
- Today's sessions overview
- Project statistics

### Commands (Ctrl+Shift+P)
- `Time Tracker: Start Time Tracking`
- `Time Tracker: Pause Time Tracking`
- `Time Tracker: Stop Time Tracking`
- `Time Tracker: Show Detailed Time Log`

### Keyboard Shortcuts
- `Ctrl+Alt+T` (`Cmd+Alt+T` on Mac): Start tracking
- `Ctrl+Alt+P` (`Cmd+Alt+P` on Mac): Pause tracking

## ⚙️ Configuration

Available settings in VS Code preferences:

| Setting | Default | Description |
|---------|---------|-------------|
| `o3-time-tracker.idleThreshold` | 5 | Minutes of inactivity before pausing |
| `o3-time-tracker.autoStart` | true | Auto-start on detected activity |
| `o3-time-tracker.showInStatusBar` | true | Show timer in status bar |
| `o3-time-tracker.saveInterval` | 30 | Auto-save interval in seconds |

## 🔧 Development

```bash
git clone https://github.com/PhilM3/o3-time-tracker.git
cd o3-time-tracker
npm install
npm run compile
```

Test the extension:
```bash
code --extensionDevelopmentPath=. --new-window
```

## 📊 Data Storage

Time tracking data is stored locally in:
`~/.vscode/extensions/o3-time-tracker/timeTrackingData.json`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🐛 Issues

Report bugs and feature requests via [GitHub Issues](https://github.com/PhilM3/o3-time-tracker/issues).

---

**Happy time tracking! ⏰** 