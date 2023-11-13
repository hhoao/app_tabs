# App Tabs

## Overview

**AppTabs** is a Gnome extension that allows your panel to include tabs for different windows of launched applications.

## Installation
Clone this repository and copy it to path `.local/share/gnome-shell/extensions/`

## Configuration
You can configure app tab style like this on preferences, and the style use the css grammar.

```json5
{
  "icon-size": 18,
  "default_style": {
    "margin": "2px 0",
    "border-radius": "8px",
    "margin-left": "2px"
  },
  "active_style": {
    "background": "#4b4b4b"
  },
  "hover_style": {
    "background": "#4b4b4b"
  }
}
```

## DEBUG
Gnome Shell:
```bash
dbus-run-session -- gnome-shell --nested --wayland
```
Preferences:
```bash
gnome-extensions prefs huanghaohhoa-dev@163.com
```

## Feature
1. You can see the application window intuitively
2. Click tab to jump to the corresponding window immediately
3. Click the Close button to close the window
