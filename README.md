# App Tabs

![](https://github.com/hhoao/app_tabs/blob/main/assets/img.png?raw=true)

## Overview

**AppTabs** is a Gnome extension that allows your panel to include tabs for different windows of launched applications.

## Installation
Clone this repository and copy it to path `.local/share/gnome-shell/extensions/`

## Configuration
You can configure app tab style like this on preferences, and the style use the css grammar.

```json5
{
  "icon-size": 18,
  "default": {
    "default_style": {
      "margin": "4px 0",
      "border-radius": "8px",
      "margin-left": "2px",
      "color": "white"
    },
    "active_style": {
      "background": "#4b4b4b"
    },
    "hover_style": {
      "background": "#4b4b4b"
    }
  },
  "light_mode": {
    "default_style": {},
    "active_style": {},
    "hover_style": {}
  },
  "dark_mode": {
    "default_style": {
    },
    "active_style": {},
    "hover_style": {}
  }
}
```

## DEBUG
Gnome Shell:
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```
For gnome shell 48:
```bash
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1366x768
dbus-run-session -- gnome-shell --nested --wayland
```
For gnome shell 49:
```bash
export G_MESSAGES_DEBUG=all
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1366x768
export SHELL_DEBUG=all
command -V mutter-devkit || sudo apt install mutter-dev-bin
dbus-run-session -- gnome-shell --devki
```
```bash
glib-compile-schemas schemas/
```
Preferences:
```bash
journalctl -f -o cat /usr/bin/gjs
gnome-extensions prefs huanghaohhoa@163.com
```

## Feature
1. You can see the application window intuitively.
2. Click tab to jump to the corresponding window immediately or hide window for active tab.
3. Click the Close button to close the window.
4. Right click tab to show window function menu.
5. Support drag and drop to rearrange the order of tabs.

If the extension has any problems or needs improvement, you can go to the extension home page to ask questions, I will have time to check and solve them.

## Development Document
* https://gjs-docs.gnome.org/
* https://gjs.guide/guides/
