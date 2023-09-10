const {GObject, St, GLib } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Me = imports.misc.extensionUtils.getCurrentExtension()
const Logger = Me.imports.utils.log.Logger;
const TabInfo = Me.imports.TabInfo.TabInfo;

var AppTabs = GObject.registerClass({
    Properties: {
        'config': GObject.ParamSpec.object(
            'config',
            'GObject Property',
            'A property holding an object derived from GObject',
            GObject.ParamFlags.READWRITE,
            GObject.Object
        ),
    },
}, class AppTabs extends PanelMenu.Button {
    _init(props) {
        super._init(1.0, null, true);
        this._config = props.config;
        this._style_config = this._config.style_config;
        this._default_initial_tabs_count = 4;
        this._tabs_pool = [];
        this._current_tabs_count = 0;
        this._targetApp = null;
        this._updateWindowsLaterId = 0;
        this._startingApps = [];
        this._logger = new Logger("AppTabs")

        this._controls = new St.BoxLayout({style_class: 'app-tabs-box'})
        this.add_child(this._controls)
        this.add_style_class_name('app-tabs')
        this.remove_style_class_name('panel-button')
        this._init_tabs();

        Main.overview.connectObject(
            'hiding', this._sync.bind(this),
            'showing', this._reset_all_tabs.bind(this), this);
        Shell.WindowTracker.get_default().connectObject('notify::focus-app',
            this._queueFocusAppChanged.bind(this), this);
        Shell.AppSystem.get_default().connectObject('app-state-changed',
            this._onAppStateChanged.bind(this), this);
        global.window_manager.connectObject('switch-workspace',
            this._sync.bind(this), this);
        global.display.connectObject('notify::focus-window', this.on_focus_window_changed.bind(this), this)
    }

    get_tab_style(is_active = false, is_hover = false) {
        let style = "";
        let default_tab_style = {...this._style_config.default_tab_style};
        if (is_hover) {
            if (this._style_config["hover-background"]) {
                default_tab_style["hover-background"] = this._style_config["hover-background"];
            }
        } else if (is_active) {
            if (this._style_config["active-background"]) {
                default_tab_style["background"] = this._style_config["active-background"];
            }
        }
        for (let name in default_tab_style) {
            style += name + ":" + default_tab_style[name] + ";";
        }
        return style;
    }


    on_focus_window_changed(param) {
        this.active_window_tab(param.focus_window)
    }

    active_window_tab(window) {
        for (let i = 0; i < this._current_tabs_count; i++) {
            if (this._tabs_pool[i].get_current_window() === window) {
                this._tabs_pool[i].get_btn()
                    .set_style(this.get_tab_style(true));
                this._tabs_pool[i].get_divide().hide();
            } else {
                this._tabs_pool[i].get_btn()
                    .set_style(this.get_tab_style());
                if (i > 0 && this._tabs_pool[i - 1].get_current_window() === window) {
                    this._tabs_pool[i].get_divide().hide();
                } else {
                    this._tabs_pool[i].get_divide().show();
                }
            }
        }
    }

    destroy() {
        super.destroy();
        Main.overview?.disconnectObject(this);
        global.display?.disconnectObject(this)
        global.window_manager?.disconnectObject(this)
        Shell.WindowTracker?.get_default().disconnectObject(this);
        Shell.AppSystem.get_default()?.disconnectObject(this);
        for (let tab of this._tabs_pool) {
            if (tab.get_btn()) {
                tab.get_btn().destroy();
            }
            if (tab.get_label()) {
                tab.get_label().destroy();
            }
        }
        this._tabs_pool = [];
        this._current_tabs_count = 0;
        this._targetApp = null;
        this._updateWindowsLaterId = 0;
        this._startingApps = [];
        this._logger = null
    }

    _init_tabs() {
        this._add_tabs(this._default_initial_tabs_count);
    }

    _reset_all_tabs() {
        let tab_count = this._current_tabs_count;
        for (let i = 0; i < tab_count; i++) {
            let tab = this._tabs_pool[i];
            this._reset_tab(tab, false);
        }
    }

    _add_tabs(count) {
        for (let i = 0; i < count; i++) {
            const divide = new St.Label();
            divide.add_style_class_name('vertical-line');
            this._controls.add_child(divide);
            divide.hide();
            const label = new St.Label({
                text: 'label',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            });
            const btn = new St.Button({track_hover: true})
            btn.add_style_class_name('app-tab');
            btn.add_actor(label);
            this._controls.add_child(btn);
            btn.hide();

            let tabInfo = new TabInfo();
            tabInfo.set_btn(btn);
            tabInfo.set_label(label);
            tabInfo.set_divide(divide);
            this._tabs_pool.push(tabInfo);
            btn.connect('clicked', () => {
                if (tabInfo.get_current_window()) {
                    tabInfo.get_current_window().activate(0);
                }
            });
        }
    }

    _onAppStateChanged(appSys, app) {
        let state = app.state;
        if (state !== Shell.AppState.STARTING)
            this._startingApps = this._startingApps.filter(a => a !== app);
        else (state === Shell.AppState.STARTING)
        this._startingApps.push(app);
        this._sync();
    }
    _queueFocusAppChanged() {
        if (this._updateWindowsLaterId2)
            return;

        const laters = global.compositor.get_laters();
        this._updateWindowsLaterId2 = laters.add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._focusAppChanged();
                return GLib.SOURCE_REMOVE;
            });
    }

    _focusAppChanged() {
        if (this._updateWindowsLaterId2) {
            const laters = global.compositor.get_laters();
            laters.remove(this._updateWindowsLaterId2);
        }
        this._updateWindowsLaterId2 = 0;

        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (!focusedApp) {
            if (global.stage.key_focus != null) {
                return;
            }
        }
        this._sync();
    }

    _findTargetApp() {
        let workspaceManager = global.workspace_manager;
        let workspace = workspaceManager.get_active_workspace();
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (focusedApp && focusedApp.is_on_workspace(workspace)) {
            return focusedApp;
        }

        for (let i = 0; i < this._startingApps.length; i++) {
            if (this._startingApps[i].is_on_workspace(workspace))
                return this._startingApps[i];
        }

        return null;
    }

    _sync(param) {
        let targetApp = this._findTargetApp();
        if (this._targetApp !== targetApp || Main.overview === param) {
            this._reset_all_tabs();
            this._targetApp?.disconnectObject(this);

            this._targetApp = targetApp;

            this._targetApp?.connectObject('windows-changed',
                () => this._queueUpdateWindowsSection(), this);

            this._targetApp?.connectObject('notify::busy', this._sync.bind(this), this);
            this._updateWindowsSection();
        }
        this._active_top_window()
    }

    _active_top_window() {
        let top_window = this._tabs_pool[0].get_current_window()
        for (let i = 0; i < this._current_tabs_count; i++) {
            if (top_window.get_layer() < this._tabs_pool[i].get_current_window().get_layer()) {
                top_window = this._tabs_pool[i].get_current_window();
            }
        }
        this.active_window_tab(top_window);
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

        if (!this._targetApp) {
            return;
        }

        const windows = this._targetApp.get_windows().filter(w => !w.skip_taskbar);
        let info = this._get_windows_info(windows);
        this._logger.info(info[0] + ":" + info[1] + ":" + info[2])
        if (info[0].length > 0) {
            this._add_tabs_by_windows(info[0])
        }
        if (info[2].length > 0) {
            this._remove_tab(info[2]);
            this._sort_tab();
        }
    }

    /**
     * @param windows
     * @returns add_tabs, reserved_tabs_index, removed_tabs_index
     * @private
     */
    _get_windows_info(windows) {
        let add_tabs = []
        let reserved_tabs_index = []
        let removed_tabs_index = []
        for (let i = 0; i < this._current_tabs_count; i++) {
            let store_window = this._tabs_pool[i].get_current_window()
            if (!windows.includes(store_window)) {
                removed_tabs_index.push(i);
            } else {
                reserved_tabs_index.push(i);
            }
        }

        for (let i = 0; i < windows.length; i++) {
            let is_add = true;
            for (let index of reserved_tabs_index) {
                if (this._tabs_pool[index].get_current_window() === windows[i]) {
                    is_add = false;
                    break;
                }
            }
            if (is_add) {
                add_tabs.push(windows[i]);
            }
        }
        return [add_tabs, reserved_tabs_index, removed_tabs_index];
    }

    _reset_tab(tab) {
        tab.set_text(null);
        tab.fadeOut();
        let current_window = tab.get_current_window();
        current_window?.disconnectObject(this);
        tab.set_current_window(null);
        this._current_tabs_count--;
    }

    _sort_tab() {
        for (let i = 0, j = this._current_tabs_count; i < j; i++, j--) {
            if (this._tabs_pool[i] && !this._tabs_pool[i].is_active()) {
                while (!this._tabs_pool[j].is_active() && i < j) {
                    j--;
                }
                if (i >= j) {
                    break;
                }
                let tmp = this._tabs_pool[i];
                this._tabs_pool[i] = this._tabs_pool[j];
                this._tabs_pool[j] = tmp;
            }
        }
    }

    /**
     * @param windows Needs to be added windows
     */
    _add_tabs_by_windows(windows) {
        if (this._current_tabs_count + windows.length > this._tabs_pool.length) {
            this._add_tabs(this._current_tabs_count + windows.length - this._tabs_pool.length);
        }
        windows.forEach((window) => {
            let tab = this._tabs_pool[this._current_tabs_count];
            tab.set_text(window.get_title() || this._targetApp.get_name())
            tab.fadeIn()
            window.connectObject('notify::title', () => {
                tab.set_text(window.get_title() || this._app.get_name());
            }, this)
            tab.set_current_window(window);
            this._current_tabs_count++;
        });
    }

    /**
     * @param indexes Needs to be removed tab index in pool
     */
    _remove_tab(indexes) {
        indexes.forEach((i) => {
            this._reset_tab(this._tabs_pool[i]);
        })
    }
})
