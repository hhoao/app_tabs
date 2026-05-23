# Standalone Tabs Mode — Design Spec

## Overview

Add a display mode toggle to App Tabs extension, allowing users to switch between the current "panel" mode (tabs embedded in GNOME top bar) and a new "standalone" mode (tabs displayed as a floating, draggable bar independent of the top bar).

## Settings Schema

Three new keys in `org.gnome.shell.extensions.app_tabs`:

| Key | Type | Default | Description |
|---|---|---|---|
| `display-mode` | string | `"standalone"` | `"panel"` or `"standalone"`, controls initial mode on startup |
| `hide-topbar-in-standalone` | boolean | `false` | When true and in standalone mode, hide `Main.panel` |
| `standalone-bar-position` | string | `"{\"x\":0,\"y\":0}"` | JSON, auto-saved on drag release, restored on attach |

## UI Changes

### Toggle Button in Tab Bar

A new button placed at the right end of `TabControls`, after the add-tab button. Icon:
- `view-fullscreen-symbolic` — when in panel mode (click to enter standalone)
- `view-restore-symbolic` — when in standalone mode (click to return to panel)

### Prefs UI

- Dropdown for default `display-mode` (panel / standalone)
- Switch for `hide-topbar-in-standalone`

## Architecture

### New File: `src/FloatingBar.js`

`FloatingBar` extends `St.BoxLayout`. It wraps the tab bar content for standalone display.

Responsibilities:
- Host the `tab_panel_container` from `TabPanel`
- Drag-to-move via `Clutter.Grab` (click on empty bar area, not tabs/buttons)
- Save position to `standalone-bar-position` on drag end
- Restore position on attach
- Constrain within screen bounds
- Default position: screen top-center
- Manage `Main.panel` show/hide per `hide-topbar-in-standalone` setting

### Modified: `src/TabControls.js`

- New method: `_create_display_mode_toggle_button()` — creates the toggle button
- New method: `get_display_mode_toggle_button()` — exposes button for layout
- New method: `set_display_mode_icon(mode)` — updates icon based on current mode
- The toggle button is placed in the `_tab_panel_container` after `_add_tab_button`
- Constructor accepts `onToggleDisplayMode` callback

### Modified: `src/TabPanel.js`

New methods:
- `_init_display_mode()` — read `display-mode` from settings, initialize `FloatingBar` if standalone
- `toggle_display_mode()` — entry point for toggle button
- `_enter_standalone_mode()` — detach from panel, attach to FloatingBar
- `_enter_panel_mode()` — detach from FloatingBar, re-attach to panel
- `_toggle_topbar_visibility()` — show/hide `Main.panel`

Mode switching flow (panel → standalone):
1. Save current panel index
2. Remove from `Main.panel` menu manager
3. Reparent `_tab_panel_container` to `FloatingBar`
4. `FloatingBar.attach()` → `Main.uiGroup.add_child()`, restore position
5. `TabPanel.hide()` (the PanelMenu.Button shell is no longer needed)
6. If `hide-topbar-in-standalone` → `Main.panel.hide()`
7. Update toggle icon

Mode switching flow (standalone → panel):
1. `Main.panel.show()` if previously hidden
2. `FloatingBar.detach()` → save position, remove from uiGroup
3. Reparent `_tab_panel_container` back to `TabPanel`
4. Re-add `TabPanel` to `Main.panel` at saved index
5. `TabPanel.show()`
6. Update toggle icon

### Modified: `extension.js`

- On `enable()`: check `display-mode` setting; if `"standalone"`, create `FloatingBar` and attach instead of `panel.addToStatusArea`
- On `disable()`: clean up `FloatingBar` if in standalone mode; restore panel visibility

## Edge Cases

| Case | Handling |
|---|---|
| Extension disabled while in standalone | Detach FloatingBar, show panel, normal destroy |
| GNOME Shell restart (`Alt+F2+r`) | Read `display-mode` from settings, restore correct mode |
| Overview open/close | FloatingBar unaffected (lives in uiGroup, not panel) |
| Multi-monitor | FloatingBar on primary monitor (future: per-monitor) |
| Popup menus (right-click, recent windows) | Unaffected — menus already use `Main.uiGroup` |
| Screen resolution change | On next drag or position restore, clamp to new bounds |

## Files Changed

- `schemas/org.gnome.shell.extensions.app_tabs.gschema.xml` — 3 new keys
- `src/config/SchemaKeyConstants.js` — 3 new constants
- `extension.js` — mode-aware init/destroy
- `src/TabPanel.js` — mode switching logic (core refactor)
- `src/TabControls.js` — toggle button
- `prefs.js` — new settings UI
- `src/FloatingBar.js` — **new file**
- `src/locale/PrefsStrings.js` — new translatable strings
