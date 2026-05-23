# Standalone Tabs Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a display mode toggle allowing users to switch between panel-embedded tabs and a floating standalone tabs bar.

**Architecture:** TabPanel gains mode-switching methods that reparent its internal container between the GNOME panel and a new FloatingBar widget. FloatingBar handles drag-to-move and position persistence. A toggle button in TabControls drives the switch.

**Tech Stack:** GNOME Shell 50, GObject/Clutter/St, GSettings, JavaScript (ES modules)

---

### Task 1: Schema — Add new GSettings keys

**Files:**
- Modify: `schemas/org.gnome.shell.extensions.app_tabs.gschema.xml`

- [ ] **Step 1: Add three new keys to the schema**

Add the following inside `<schemalist><schema id="org.gnome.shell.extensions.app_tabs">` block, after the last existing `<key>` for `recent-windows-state`:

```xml
        <key name="display-mode" type="s">
            <choices>
                <choice value="panel"/>
                <choice value="standalone"/>
            </choices>
            <default>"standalone"</default>
        </key>
        <key name="hide-topbar-in-standalone" type="b">
            <default>false</default>
        </key>
        <key name="standalone-bar-position" type="s">
            <default>"{\"x\":0,\"y\":0}"</default>
        </key>
```

Use Edit to insert between `</key>` of `recent-windows-state` and `</schema>`.

- [ ] **Step 2: Verify schema syntax**

```bash
xmllint --noout schemas/org.gnome.shell.extensions.app_tabs.gschema.xml
```

Expected: no output (no errors).

- [ ] **Step 3: Compile schema for local testing**

```bash
glib-compile-schemas schemas/
```

Expected: no errors, produces `schemas/gschemas.compiled`.

- [ ] **Step 4: Commit**

```bash
git add schemas/org.gnome.shell.extensions.app_tabs.gschema.xml schemas/gschemas.compiled
git commit -m "feat(schema): add display-mode, hide-topbar-in-standalone, and standalone-bar-position keys"
```

---

### Task 2: SchemaKeyConstants — Add new constants

**Files:**
- Modify: `src/config/SchemaKeyConstants.js`

- [ ] **Step 1: Add three new constants**

Use Edit to add after the `RECENT_WINDOWS_STATE` line:

```js
    DISPLAY_MODE: "display-mode",
    HIDE_TOPBAR_IN_STANDALONE: "hide-topbar-in-standalone",
    STANDALONE_BAR_POSITION: "standalone-bar-position",
```

- [ ] **Step 2: Commit**

```bash
git add src/config/SchemaKeyConstants.js
git commit -m "feat(constants): add display-mode, hide-topbar-in-standalone, standalone-bar-position keys"
```

---

### Task 3: PrefsStrings — Add new translatable strings

**Files:**
- Modify: `src/locale/PrefsStrings.js`

- [ ] **Step 1: Add strings before the closing `};`**

Use Edit to add before the `};` ending the export:

```js
    get displayMode() {
        return _('Default display mode');
    },
    get displayModePanel() {
        return _('Panel');
    },
    get displayModeStandalone() {
        return _('Standalone');
    },
    get hideTopbarInStandalone() {
        return _('Hide top bar in standalone mode');
    },
```

- [ ] **Step 2: Commit**

```bash
git add src/locale/PrefsStrings.js
git commit -m "feat(i18n): add display mode and hide-topbar prefs strings"
```

---

### Task 4: FloatingBar — Create new file

**Files:**
- Create: `src/FloatingBar.js`

- [ ] **Step 1: Write `src/FloatingBar.js`**

```js
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SchemaKeyConstants } from '../src/config/SchemaKeyConstants.js';

export const FloatingBar = GObject.registerClass({}, class FloatingBar extends St.BoxLayout {
    _init({ tabPanel, settings }) {
        super._init({
            reactive: true,
            style_class: 'app-tabs-floating-bar',
        });
        this._tabPanel = tabPanel;
        this._settings = settings;
        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._barStartX = 0;
        this._barStartY = 0;

        this.connect('button-press-event', (actor, event) => {
            if (event.get_source() !== this)
                return Clutter.EVENT_PROPAGATE;
            this._begin_drag(event);
            return Clutter.EVENT_STOP;
        });
    }

    _begin_drag(event) {
        this._dragging = true;
        let [stageX, stageY] = event.get_coords();
        this._dragStartX = stageX;
        this._dragStartY = stageY;
        this._barStartX = this.x;
        this._barStartY = this.y;

        this._motionId = global.stage.connect('motion-event', (_actor, ev) => {
            let [mx, my] = ev.get_coords();
            let newX = this._barStartX + (mx - this._dragStartX);
            let newY = this._barStartY + (my - this._dragStartY);

            let monitor = global.display.get_primary_monitor();
            let geom = monitor.get_geometry();
            newX = Math.max(0, Math.min(newX, geom.width - this.width));
            newY = Math.max(0, Math.min(newY, geom.height - this.height));

            this.set_position(Math.round(newX), Math.round(newY));
            return Clutter.EVENT_STOP;
        });

        this._releaseId = global.stage.connect('button-release-event', () => {
            this._end_drag();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _end_drag() {
        this._dragging = false;
        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = null;
        }
        if (this._releaseId) {
            global.stage.disconnect(this._releaseId);
            this._releaseId = null;
        }
        let pos = JSON.stringify({ x: this.x, y: this.y });
        this._settings.set_string(SchemaKeyConstants.STANDALONE_BAR_POSITION, pos);
    }

    attach() {
        let posStr = this._settings.get_string(SchemaKeyConstants.STANDALONE_BAR_POSITION);
        let pos = { x: 0, y: 0 };
        try {
            pos = JSON.parse(posStr);
        } catch (_e) { /* use defaults */ }

        let monitor = global.display.get_primary_monitor();
        let geom = monitor.get_geometry();
        pos.x = Math.max(0, Math.min(pos.x, geom.width - 200));
        pos.y = Math.max(0, Math.min(pos.y, geom.height - 40));

        this.set_position(pos.x, pos.y);
        Main.uiGroup.add_child(this);

        // Raise to top so it's above other UI elements
        this.get_parent().set_child_above_sibling(this, null);
    }

    detach() {
        let pos = JSON.stringify({ x: this.x, y: this.y });
        this._settings.set_string(SchemaKeyConstants.STANDALONE_BAR_POSITION, pos);

        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = null;
        }
        if (this._releaseId) {
            global.stage.disconnect(this._releaseId);
            this._releaseId = null;
        }

        if (this.get_parent())
            this.get_parent().remove_child(this);
    }

    destroy() {
        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = null;
        }
        if (this._releaseId) {
            global.stage.disconnect(this._releaseId);
            this._releaseId = null;
        }
        this._tabPanel = null;
        this._settings = null;
        super.destroy();
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/FloatingBar.js
git commit -m "feat: add FloatingBar component for standalone mode"
```

---

### Task 5: TabControls — Add display mode toggle button

**Files:**
- Modify: `src/TabControls.js`

- [ ] **Step 1: Update constructor to accept `onToggleDisplayMode` callback**

Add parameter to constructor destructuring (line 10):
```js
constructor({ isDarkMode, panelHeight, onAddTab = null, onShowRecentWindows = null, onToggleDisplayMode = null }) {
```

- [ ] **Step 2: Initialize toggle button properties in constructor**

Add after the existing init lines (after `this.set_add_tab_visible(false)` and before `this._ensure_divider_count()`):

```js
        this._on_toggle_display_mode = onToggleDisplayMode ?? (() => {});
        this._display_mode_toggle_button = this._create_display_mode_toggle_button();
```

- [ ] **Step 3: Add toggle button getters and setters**

Add before the `destroy()` method:

```js
    get_display_mode_toggle_button() {
        return this._display_mode_toggle_button;
    }

    set_display_mode_icon(mode) {
        let icon = this._display_mode_toggle_button?.get_first_child();
        if (!icon)
            return;
        if (mode === 'standalone')
            icon.set_icon_name('view-restore-symbolic');
        else
            icon.set_icon_name('view-fullscreen-symbolic');
    }
```

- [ ] **Step 4: Add `_create_display_mode_toggle_button` method**

Add before the `destroy()` method:

```js
    _create_display_mode_toggle_button() {
        let icon = new St.Icon({
            icon_name: 'view-fullscreen-symbolic',
            icon_size: 16,
        });
        let button = new St.Button({
            y_align: Clutter.ActorAlign.CENTER,
            child: icon,
        });
        button.add_style_class_name('app-tabs-display-mode-button');
        button.connect('clicked', () => {
            this._on_toggle_display_mode?.();
        });
        button.connect('notify::hover', () => {
            this._apply_add_button_style();
        });
        button.set_style(this._get_add_button_style());
        return button;
    }
```

- [ ] **Step 5: Update `destroy()` to clean up new properties**

Add to the `destroy()` method's cleanup section:

```js
        this._display_mode_toggle_button = null;
        this._on_toggle_display_mode = null;
```

- [ ] **Step 6: Commit**

```bash
git add src/TabControls.js
git commit -m "feat(tab-controls): add display mode toggle button"
```

---

### Task 6: TabPanel — Add mode switching logic

**Files:**
- Modify: `src/TabPanel.js`

This is the core refactor. Changes are concentrated in: imports, constructor init, new methods, destroy cleanup, and connecting the toggle button to the panel container.

- [ ] **Step 1: Add FloatingBar import**

Add after the `ProcessLaunchContext` import (after line 25):

```js
import { FloatingBar } from './FloatingBar.js';
```

- [ ] **Step 2: Add display mode initialization in constructor**

After `this.show_recent_windows_menu` assignment (after line 61), add:

```js
        this._display_mode = this._settings.get_string(SchemaKeyConstants.DISPLAY_MODE);
        this._saved_panel_index = 0;
        this._floating_bar = null;
        this._topbar_was_hidden = false;
```

- [ ] **Step 3: Pass `onToggleDisplayMode` to TabControls constructor**

Change the TabControls instantiation (lines 63-68) to include the callback:

```js
        this._tab_controls = new TabControls({
            isDarkMode: this._is_dark_mode(),
            panelHeight: this._get_panel_height(),
            onAddTab: this._open_new_tab_for_target_app.bind(this),
            onShowRecentWindows: this._toggle_recent_windows_menu.bind(this),
            onToggleDisplayMode: this.toggle_display_mode.bind(this),
        });
```

- [ ] **Step 4: Add the toggle button to the tab panel container**

After `this._tab_panel_container.add_child(this._tab_controls.get_add_tab_button())` (line 75), add:

```js
        this._tab_panel_container.add_child(this._tab_controls.get_display_mode_toggle_button());
```

- [ ] **Step 5: Add `_listen_settings` entry for display-mode and hide-topbar**

Add after the existing `changed::` listeners (after the `RECENT_WINDOWS_STATE`-related blocks, around line 146):

```js
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.DISPLAY_MODE),
            this._on_display_mode_setting_changed.bind(this),
            this,
        );
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.HIDE_TOPBAR_IN_STANDALONE),
            this._on_hide_topbar_setting_changed.bind(this),
            this,
        );
```

- [ ] **Step 6: Initialize standalone mode on startup if needed**

Add after the `this._listen_settings()` call (line 105):

```js
        if (this._display_mode === 'standalone')
            this._init_standalone_display();
```

- [ ] **Step 7: Add mode switching methods before `destroy()`**

Add all new methods before the `destroy()` method. Place them after `_on_workspace_switched` and before `destroy`:

```js
    _init_standalone_display() {
        if (this._floating_bar)
            return;

        this._floating_bar = new FloatingBar({
            tabPanel: this,
            settings: this._settings,
        });
        // Remove container from self, add to FloatingBar
        if (this._tab_panel_container.get_parent())
            this._tab_panel_container.get_parent().remove_child(this._tab_panel_container);
        this._floating_bar.add_child(this._tab_panel_container);
        this._floating_bar.attach();
        this.hide();
        this._tab_controls.set_display_mode_icon('standalone');
        this._apply_topbar_visibility(true);
    }

    toggle_display_mode() {
        if (this._display_mode === 'panel') {
            this._enter_standalone_mode();
        } else {
            this._enter_panel_mode();
        }
    }

    _enter_standalone_mode() {
        if (this._display_mode === 'standalone')
            return;

        this._display_mode = 'standalone';
        this._settings.set_string(SchemaKeyConstants.DISPLAY_MODE, 'standalone');

        // Find our index in panel for restoration later
        let statusArea = Main.panel.statusArea;
        let children = Object.keys(statusArea);
        this._saved_panel_index = children.indexOf('AppTabs');

        // Remove from panel status area
        if (this.get_parent())
            this.get_parent().remove_child(this);

        // Create FloatingBar and reparent
        this._floating_bar = new FloatingBar({
            tabPanel: this,
            settings: this._settings,
        });
        if (this._tab_panel_container.get_parent())
            this._tab_panel_container.get_parent().remove_child(this._tab_panel_container);
        this._floating_bar.add_child(this._tab_panel_container);
        this._floating_bar.attach();
        this.hide();
        this._tab_controls.set_display_mode_icon('standalone');
        this._apply_topbar_visibility(true);
    }

    _enter_panel_mode() {
        if (this._display_mode === 'panel')
            return;

        this._display_mode = 'panel';
        this._settings.set_string(SchemaKeyConstants.DISPLAY_MODE, 'panel');

        this._apply_topbar_visibility(false);

        // Detach and destroy FloatingBar
        if (this._floating_bar) {
            let container = this._tab_panel_container;
            if (container.get_parent())
                container.get_parent().remove_child(container);
            this._floating_bar.detach();
            this._floating_bar.destroy();
            this._floating_bar = null;
            this.add_child(container);
        }

        // Re-add to panel at saved index
        Main.panel.addToStatusArea('AppTabs', this, this._saved_panel_index, 'left');
        this.show();
        this._tab_controls.set_display_mode_icon('panel');
    }

    _apply_topbar_visibility(enteringStandalone) {
        if (!enteringStandalone) {
            if (this._topbar_was_hidden) {
                Main.panel.show();
                this._topbar_was_hidden = false;
            }
            return;
        }

        let shouldHide = this._settings.get_boolean(SchemaKeyConstants.HIDE_TOPBAR_IN_STANDALONE);
        if (shouldHide && Main.panel.visible) {
            Main.panel.hide();
            this._topbar_was_hidden = true;
        }
    }

    _on_display_mode_setting_changed(settings, key) {
        let newMode = settings.get_string(key);
        if (newMode === this._display_mode)
            return;

        if (newMode === 'standalone')
            this._enter_standalone_mode();
        else
            this._enter_panel_mode();
    }

    _on_hide_topbar_setting_changed() {
        if (this._display_mode === 'standalone')
            this._apply_topbar_visibility(true);
    }
```

- [ ] **Step 8: Update `destroy()` to clean up FloatingBar and restore panel**

Before `super.destroy()` (line 813), add:

```js
        if (this._floating_bar) {
            this._floating_bar.destroy();
            this._floating_bar = null;
        }
        if (this._topbar_was_hidden) {
            Main.panel.show();
            this._topbar_was_hidden = false;
        }
```

- [ ] **Step 9: Commit**

```bash
git add src/TabPanel.js
git commit -m "feat(tab-panel): add standalone/panel mode switching with FloatingBar"
```

---

### Task 7: extension.js — Mode-aware enable/disable

**Files:**
- Modify: `extension.js`

- [ ] **Step 1: Update `enable()` to handle standalone init**

Replace the current `enable()` method (lines 10-22):

```js
    enable() {
        globalThis.DockerContainersExtension = this;
        this._logger = new Logger("AppTabsExtension")
        this._config = new Config();
        this._settings = this.getSettings();
        this._tabs = new TabPanel(
            {
                config: this._config,
                settings: this._settings
            });
        this._logger.info("Enabling extension...");
        // TabPanel handles its own display mode internally;
        // in panel mode it adds itself to the panel via addToStatusArea
        if (this._settings.get_string('display-mode') === 'panel') {
            Main.panel.addToStatusArea(
                'AppTabs', this._tabs, this._config.index, this._config.side
            );
        }
    }
```

Note: TabPanel constructor now already calls `_init_standalone_display()` when `display-mode` is `"standalone"`. So in `enable()` we only need to add to panel if in panel mode.

- [ ] **Step 2: Verify `disable()` handles standalone cleanup**

The current `disable()` (lines 24-32) calls `this._tabs.destroy()` which already handles FloatingBar cleanup (from Task 6 Step 8). No changes needed for `disable()`. Add `this._settings = null` cleanup:

```js
    disable() {
        delete globalThis.DockerContainersExtension;
        this._logger.info("Disabling extension...");
        this._logger = null;
        this._config = null;
        this._tabs.destroy();
        this._tabs = null;
        this._settings = null;
    }
```

- [ ] **Step 3: Commit**

```bash
git add extension.js
git commit -m "feat(extension): mode-aware enable/disable for standalone tabs"
```

---

### Task 8: prefs.js — Add settings UI

**Files:**
- Modify: `prefs.js`

- [ ] **Step 1: Add getters for new setting rows**

Add after `get_show_recent_windows_menu_row` (line 250) and before `get_app_tab_config_group`:

```js
    get_display_mode_row(settings) {
        const key_name = SchemaKeyConstants.DISPLAY_MODE;
        const combo = new Gtk.DropDown({
            valign: Gtk.Align.CENTER,
            model: new Gtk.StringList([
                PrefsStrings.displayModePanel,
                PrefsStrings.displayModeStandalone,
            ]),
        });
        let currentMode = settings.get_string(key_name);
        combo.set_selected(currentMode === 'standalone' ? 1 : 0);
        combo.connect('notify::selected', () => {
            let mode = combo.get_selected() === 1 ? 'standalone' : 'panel';
            settings.set_string(key_name, mode);
        });
        settings.connect('changed::' + key_name, () => {
            let mode = settings.get_string(key_name);
            combo.set_selected(mode === 'standalone' ? 1 : 0);
        });

        const row = new Adw.ActionRow({
            title: PrefsStrings.displayMode,
        });
        row.add_suffix(combo);
        row.activatable_widget = combo;
        return row;
    }

    get_hide_topbar_in_standalone_row(settings) {
        const key_name = SchemaKeyConstants.HIDE_TOPBAR_IN_STANDALONE;
        const gtk_switch = new Gtk.Switch({
            active: settings.get_boolean(key_name),
            valign: Gtk.Align.CENTER,
        });
        settings.bind(key_name, gtk_switch, 'active', Gio.SettingsBindFlags.DEFAULT);

        const row = new Adw.ActionRow({
            title: PrefsStrings.hideTopbarInStandalone,
        });
        row.add_suffix(gtk_switch);
        row.activatable_widget = gtk_switch;
        return row;
    }
```

- [ ] **Step 2: Add new rows to `get_appearance_group`**

Add after the `show_add_tab_button_switch` line (after line 176) and before `return group`:

```js
        const display_mode_row = this.get_display_mode_row(settings);
        const hide_topbar_in_standalone_row = this.get_hide_topbar_in_standalone_row(settings);
        group.add(display_mode_row);
        group.add(hide_topbar_in_standalone_row);
```

- [ ] **Step 3: Commit**

```bash
git add prefs.js
git commit -m "feat(prefs): add display mode dropdown and hide-topbar switch"
```

---

### Task 9: Locale — Update POT and PO files

**Files:**
- Run commands to regenerate: `locale/app_tabs.pot`, `locale/zh_CN/LC_MESSAGES/app_tabs.po`

- [ ] **Step 1: Regenerate POT from source**

```bash
xgettext --from-code=UTF-8 --add-comments --output=locale/app_tabs.pot \
  --package-name="Application Tabs Dev" \
  src/locale/PrefsStrings.js src/locale/AppTabMenuStrings.js
```

- [ ] **Step 2: Update zh_CN PO file**

```bash
msgmerge --update locale/zh_CN/LC_MESSAGES/app_tabs.po locale/app_tabs.pot
```

- [ ] **Step 3: Edit PO to add Chinese translations for new strings**

Open `locale/zh_CN/LC_MESSAGES/app_tabs.po` and add translations for:
- "Default display mode" → "默认显示模式"
- "Panel" → "面板"
- "Standalone" → "独立"
- "Hide top bar in standalone mode" → "独立模式下隐藏顶栏"

- [ ] **Step 4: Compile MO file**

```bash
msgfmt -o locale/zh_CN/LC_MESSAGES/app_tabs.mo locale/zh_CN/LC_MESSAGES/app_tabs.po
```

- [ ] **Step 5: Commit**

```bash
git add locale/app_tabs.pot locale/zh_CN/LC_MESSAGES/app_tabs.po locale/zh_CN/LC_MESSAGES/app_tabs.mo
git commit -m "feat(i18n): add Chinese translations for display mode settings"
```

---

### Task 10: Stylesheet — Add FloatingBar style

**Files:**
- Modify: `stylesheet.css`

- [ ] **Step 1: Add FloatingBar CSS class**

```css
.app-tabs-floating-bar {
    background-color: rgba(0, 0, 0, 0.8);
    border-radius: 8px;
    padding: 2px 4px;
}
```

- [ ] **Step 2: Commit**

```bash
git add stylesheet.css
git commit -m "style: add floating bar background style"
```

---

### Task 11: Verification — Manual check points

These are manual verification steps (not automated tests, since GNOME Shell extensions require a running shell).

- [ ] **Step 1: Verify schema compiles cleanly**

```bash
glib-compile-schemas schemas/ --dry-run
```

Expected: no errors.

- [ ] **Step 2: Verify all imports resolve**

```bash
grep -rn "import.*FloatingBar\|import.*SchemaKeyConstants" src/ extension.js
```

Expected: FloatingBar imported in TabPanel.js, SchemaKeyConstants used where needed.

- [ ] **Step 3: Verify no syntax errors (basic JS parse)**

```bash
node --check src/FloatingBar.js && echo "OK"
node --check src/TabControls.js && echo "OK"
node --check src/TabPanel.js && echo "OK"
node --check extension.js && echo "OK"
node --check prefs.js && echo "OK"
```

Expected: each file prints "OK".

- [ ] **Step 4: Commit any final fixes**

If verification reveals issues, fix and commit.
