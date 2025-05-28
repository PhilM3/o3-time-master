# O3 Time Tracker

Eine intelligente Zeiterfassungs-Extension für VS Code mit projektbasiertem Tracking und automatischer Aktivitätserkennung.

## 🚀 Features

### ⏱️ Automatische Zeiterfassung
- **Intelligente Aktivitätserkennung**: Automatisches Starten/Pausieren basierend auf Ihrer Aktivität
- **Projektbasiertes Tracking**: Separate Zeiterfassung für verschiedene Projekte/Workspaces
- **Hintergrund-Tracking**: Erfassung auch bei Cursor Agent und anderen automatisierten Aktivitäten
- **Idle-Erkennung**: Automatisches Pausieren bei Inaktivität

### 📊 Primary Sidebar
- **Echtzeit-Übersicht**: Live-Anzeige der aktuellen Session
- **Tagesübersicht**: Alle heutigen Arbeitssessions auf einen Blick
- **Projektübersicht**: Gesamtzeit und Sessions pro Projekt
- **Schnellzugriff**: Start/Pause/Stop-Buttons direkt in der Sidebar

### 📈 Detaillierte Berichte
- **Arbeitszeit-Log**: Detaillierte Übersicht mit Start-/Endzeiten (z.B. 09:13-10:35)
- **Aktivitätszähler**: Textänderungen und Cursor-Bewegungen pro Session
- **Tagesberichte**: Zusammenfassung aller Sessions eines Tages
- **Projektstatistiken**: Gesamtzeit, durchschnittliche Session-Dauer, aktive Tage

### 💾 Lokale Datenspeicherung
- **Permanente Speicherung**: Alle Daten werden lokal in `timeTrackingData.json` gespeichert
- **Auto-Save**: Automatisches Speichern alle 30 Sekunden
- **Export-Funktion**: Daten als JSON exportieren

### 🌐 Globale Zusammenfassung
- **Projektübergreifende Auswertung**: Zusammenfassung aller Tracking-Daten aus verschiedenen Workspaces
- **Workspace-Isolation**: Jeder Workspace behält seine eigenen Daten, aber globale Übersicht möglich
- **Heute-Übersicht**: Heutige Arbeitszeit über alle Projekte hinweg
- **Automatische Aggregation**: Intelligente Zusammenführung von Daten aus allen Workspace-Ordnern
- **Cache-System**: Optimierte Performance durch 30-Sekunden-Cache

## 🎯 Verwendung

### Installation
1. Extension in VS Code installieren
2. Automatischer Start beim Öffnen von VS Code

### Grundlegende Bedienung

#### Über die Primary Sidebar
1. Klicken Sie auf das Uhr-Symbol (⏰) in der Activity Bar
2. Verwenden Sie die Toolbar-Buttons:
   - ▶️ **Start**: Zeiterfassung starten
   - ⏸️ **Pause**: Zeiterfassung pausieren
   - ⏹️ **Stop**: Zeiterfassung beenden
   - 🔄 **Refresh**: Ansicht aktualisieren

#### Über Befehle (Ctrl+Shift+P)
- `Time Tracker: Start Time Tracking`
- `Time Tracker: Pause Time Tracking`
- `Time Tracker: Stop Time Tracking`
- `Time Tracker: Show Detailed Time Log`
- `Time Tracker: Show Today's Sessions`
- `Time Tracker: Show Project Statistics`
- `Time Tracker: Export Time Data`

#### Über Tastenkürzel
- `Ctrl+Alt+T` (Mac: `Cmd+Alt+T`): Zeiterfassung starten
- `Ctrl+Alt+P` (Mac: `Cmd+Alt+P`): Zeiterfassung pausieren

### Status Bar
Die aktuelle Session wird in der Status Bar angezeigt:
- `⏱ 1h 23m` - Aktive Session mit Zeitanzeige
- `⏸ Paused` - Pausierte Session
- `⏱ Ready` - Bereit zum Starten

## ⚙️ Konfiguration

Öffnen Sie die VS Code Einstellungen und suchen Sie nach "O3 Time Tracker":

```json
{
  "o3-time-tracker.idleThreshold": 5,
  "o3-time-tracker.autoStart": true,
  "o3-time-tracker.showInStatusBar": true,
  "o3-time-tracker.saveInterval": 30,
  "o3-time-tracker.trackBackground": true
}
```

### Verfügbare Einstellungen

| Einstellung | Standard | Beschreibung |
|-------------|----------|--------------|
| `idleThreshold` | 5 | Minuten Inaktivität bis Session als idle gilt |
| `autoStart` | true | Automatisches Starten bei erkannter Aktivität |
| `showInStatusBar` | true | Zeitanzeige in der Status Bar |
| `saveInterval` | 30 | Auto-Save Intervall in Sekunden |
| `trackBackground` | true | Tracking auch bei Hintergrund-Aktivitäten |

## 📁 Datenstruktur

Die Tracking-Daten werden in `~/.vscode/extensions/o3-time-tracker/timeTrackingData.json` gespeichert:

```json
{
  "version": "1.0.0",
  "lastSaved": "2024-01-15T10:30:00.000Z",
  "totalTimeTracked": 28800000,
  "projects": [
    {
      "projectName": "My Project",
      "projectPath": "/path/to/project",
      "totalTime": 14400000,
      "sessions": [
        {
          "id": "1705312200000-abc123",
          "startTime": "2024-01-15T09:00:00.000Z",
          "endTime": "2024-01-15T13:00:00.000Z",
          "totalTime": 14400000,
          "textChanges": 156,
          "cursorMovements": 423
        }
      ]
    }
  ]
}
```

## 🔧 Entwicklung

### Voraussetzungen
- Node.js 16+
- VS Code 1.74+

### Setup
```bash
git clone <repository-url>
cd o3-time-tracker
npm install
npm run compile
```

### Entwicklung
```bash
npm run compile:watch  # TypeScript im Watch-Modus
code --extensionDevelopmentPath=. --new-window  # Extension testen
```

### Build
```bash
npm run compile  # TypeScript kompilieren
npm run lint     # Code-Qualität prüfen
```

## 🤝 Beitragen

1. Fork des Repositories
2. Feature Branch erstellen (`git checkout -b feature/amazing-feature`)
3. Änderungen committen (`git commit -m 'Add amazing feature'`)
4. Branch pushen (`git push origin feature/amazing-feature`)
5. Pull Request erstellen

## 📝 Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Siehe [LICENSE](LICENSE) für Details.

## 🐛 Probleme melden

Probleme und Feature-Requests können über [GitHub Issues](https://github.com/your-username/o3-time-tracker/issues) gemeldet werden.

## 📊 Changelog

### Version 1.0.0
- ✅ Automatische Zeiterfassung mit Aktivitätserkennung
- ✅ Primary Sidebar mit Echtzeit-Übersicht
- ✅ Detaillierte Arbeitszeit-Logs mit Start-/Endzeiten
- ✅ Projektbasiertes Tracking
- ✅ Lokale Datenspeicherung
- ✅ Export-Funktionalität
- ✅ Hintergrund-Tracking für Cursor Agent
- ✅ Deutsche Lokalisierung

---

**Viel Spaß beim Tracken Ihrer Arbeitszeit! ⏰** 