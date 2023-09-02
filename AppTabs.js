const {GObject, St} = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const WinTracker = imports.gi.Shell.WindowTracker.get_default()
const Overview = imports.ui.overview;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;

var AppTabs = class AppTabs {
    enable(uuid) {
        this._default_initial_tabs_count = 4;
        this._tabs_pool = [];
        this._current_tabs_count = 0;
        this._targetApp = null;
        this._updateWindowsLaterId = 0;
        this._startingApps = [];

        this._uuid = uuid;

        this._init_tabs();
        Main.overview.connect(
            'hiding', this._sync.bind(this),
            'showing', this._sync.bind(this));
        Shell.WindowTracker.get_default().connectObject('notify::focus-app',
            this._focusAppChanged.bind(this), this);
        Shell.AppSystem.get_default().connectObject('app-state-changed',
            this._onAppStateChanged.bind(this), this);
        global.window_manager.connectObject('switch-workspace',
            this._sync.bind(this), this);
    }
    destroy() {

    }
    _init_tabs() {
        this._add_tabs_count(this._default_initial_tabs_count);
    }

    _reset_tabs() {
        for (let i = 0; i < this._current_tabs_count; i++) {
            let tab = this._tabs_pool[i];
            tab.set_text('');
            tab.fadeOut();
            let current_window = tab.get_current_window();
            current_window?.disconnectObject(this);
        }
        this._current_tabs_count = 0;
    }

    getUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0
            const v = c === 'x' ? r : (r & 0x3 | 0x8)
            return v.toString(16)
        })
    }

    _add_tabs_count(count) {
        for (let i = 0; i < count; i++) {
            const tab = new AppTab({
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            tab.hide()
            this._tabs_pool.push(tab);
            Main.panel.addToStatusArea(this.getUuid(), tab, 10, 'left');
        }
    }

    _onAppStateChanged(appSys, app) {
        let state = app.state;
        if (state !== Shell.AppState.STARTING)
            this._startingApps = this._startingApps.filter(a => a !== app);
        else if (state === Shell.AppState.STARTING)
            this._startingApps.push(app);
        this._sync();
    }

    _focusAppChanged() {
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (!focusedApp) {
            if (global.stage.key_focus != null)
                return;
        }
        this._sync();
    }

    _findTargetApp() {
        let workspaceManager = global.workspace_manager;
        let workspace = workspaceManager.get_active_workspace();
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (focusedApp && focusedApp.is_on_workspace(workspace))
            return focusedApp;

        for (let i = 0; i < this._startingApps.length; i++) {
            if (this._startingApps[i].is_on_workspace(workspace))
                return this._startingApps[i];
        }

        return null;
    }

    _sync() {
        let targetApp = this._findTargetApp();

        if (this._targetApp !== targetApp) {
            this._targetApp?.disconnectObject(this);

            this._targetApp = targetApp;

            this._targetApp?.connectObject('windows-changed',
                () => this._queueUpdateWindowsSection(), this);

            this._targetApp?.connectObject('notify::busy', this._sync.bind(this), this);
            this._updateWindowsSection();
        }
    }

    _queueUpdateWindowsSection() {
        if (this._updateWindowsLaterId)
            return;

        const laters = global.compositor.get_laters();
        this._updateWindowsLaterId = laters.add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._updateWindowsSection();
                return GLib.SOURCE_REMOVE;
            });
    }

    _updateWindowsSection() {
        if (this._updateWindowsLaterId) {
            const laters = global.compositor.get_laters();
            laters.remove(this._updateWindowsLaterId);
        }
        this._updateWindowsLaterId = 0;

        this._reset_tabs();

        if (!this._targetApp) {
            return;
        }

        const windows = this._targetApp.get_windows();
        if (windows.length > this._tabs_pool.length) {
            this._add_tabs_count(windows.length - this._tabs_pool.length);
        }
        for (let i = 0; i < windows.length; i++) {
            let window = windows[i];
            let tab = this._tabs_pool[i];
            tab.set_text(window.get_title() || this._targetApp.get_name())
            tab.fadeIn()
            window.connectObject('notify::title', () => {
                tab.set_text(window.get_title() || this._app.get_name());
            }, this)
            tab.set_current_window(window);
            this._current_tabs_count++;
        }
    }
}

const AppTab = GObject.registerClass({
    Signals: {'changed': {}}
}, class AppTab extends PanelMenu.Button {
    _init(param) {
        super._init(1.0, null, true);
        this._current_window = null;
        let bin = new St.Bin({name: 'appTabs'});
        this.add_child(bin);
        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        bin.set_child(this._label);
        this.connect('key-press-event', this.on_button_press_event.bind(this));
    }

    on_button_press_event(actor, event) {
        if (this._current_window) {
            this._current_window.activate(0);
            let colorResult = Clutter.Color.from_string('#818181')
            if (colorResult[0]) {
                this.set_background_color(colorResult[1]);
            }
        }
    }

    set_current_window(window) {
        this._current_window = window;
    }
    get_current_window() {
        return this._current_window;
    }

    set_text(text) {
        this._label.set_text(text);
    }

    fadeIn() {
        if (this.visible)
            return;

        this.show();
        this.reactive = true;
        this.remove_all_transitions();
        this.ease({
            opacity: 255,
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    fadeOut() {
        if (!this.visible)
            return;

        this.hide();
        this.reactive = false;
        this.remove_all_transitions();
        this.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Overview.ANIMATION_TIME,
        });
    }
})

