const {GObject, St, GLib, Gio} = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const WinTracker = imports.gi.Shell.WindowTracker.get_default()
const Overview = imports.ui.overview;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Me = imports.misc.extensionUtils.getCurrentExtension()
const CommonUtils = Me.imports.utils.common;
const Logger = Me.imports.utils.log.Logger;

var AppTabs = GObject.registerClass(
    class AppTabs extends GObject.Object {
        enable(config) {
            this._default_initial_tabs_count = 4;
            this._tabs_pool = [];
            this._current_tabs_count = 0;
            this._targetApp = null;
            this._updateWindowsLaterId = 0;
            this._startingApps = [];
            this._logger = new Logger("AppTabs")
            this._style_config = config.get_style_config();

            this._init_tabs();
            Main.overview.connectObject(
                'hiding', this._sync.bind(this),
                'showing', this._reset_all_tabs.bind(this), this);
            Shell.WindowTracker.get_default().connectObject('notify::focus-app',
                this._focusAppChanged.bind(this), this);
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
                style += name + ":" + default_tab_style[name]+ ";"                                      ;
            }
            return style;
        }


        on_focus_window_changed(param) {
            this.active_window_tab(param.focus_window)
        }

        active_window_tab(window) {
            for (let i = 0; i < this._current_tabs_count; i++) {
                if (this._tabs_pool[i].get_current_window() === window) {
                    this._tabs_pool[i]
                        .set_style(this.get_tab_style(true));
                } else {
                    this._tabs_pool[i]
                        .set_style(this.get_tab_style());
                }
            }
        }
        destroy() {
            Main.overview?.disconnectObject(this);
            global.display?.disconnectObject(this)
            global.window_manager?.disconnectObject(this)
            Shell.WindowTracker?.get_default().disconnectObject(this);
            Shell.AppSystem.get_default()?.disconnectObject(this);
            for (let tab of this._tabs_pool) {
                tab.destroy();
            }
            this._tabs_pool = [];
            this._current_tabs_count = 0;
            this._targetApp = null;
            this._updateWindowsLaterId = 0;
            this._startingApps = [];
            this._logger = null
        }

        _init_tabs() {
            this._add_tabs_count(this._default_initial_tabs_count);
        }

        _reset_all_tabs() {
            let tab_count = this._current_tabs_count;
            for (let i = 0; i < tab_count; i++) {
                let tab = this._tabs_pool[i];
                this._reset_tab(tab, false);
            }
        }

        _add_tabs_count(count) {
            for (let i = 0; i < count; i++) {
                const tab = new AppTab();
                tab.add_style_class_name('app-tab');
                tab.hide()
                tab.set_style(this.get_tab_style());
                this._tabs_pool.push(tab);
                Main.panel.addToStatusArea(tab.get_uuid(), tab, 10, 'left');
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

        _focusAppChanged() {
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
            if (info[0].length > 0) {
                this._add_tabs(info[0])
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
        _add_tabs(windows) {
            if (this._current_tabs_count + windows.length > this._tabs_pool.length) {
                this._add_tabs_count(this._current_tabs_count + windows.length - this._tabs_pool.length);
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

const AppTab = GObject.registerClass({
    Signals: {'changed': {}}
}, class AppTab extends PanelMenu.Button {
    _init(config) {
        super._init(1.0, null, true);
        this._default_tab_width = 100;
        this._current_window = null;
        this._uuid = CommonUtils.generate_uuid();

        this._bin = new St.Bin({name: 'appTabs', width: this._default_tab_width});
        this.add_child(this._bin);
        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._bin.set_child(this._label);
        // this._bin.set_style("width: 100%; margin: 4px; border-style: solid; border-color: gray; border: 0px; border-left-width: 2px; border-right-width: 2px;")
        this.connect('key-press-event', this.on_button_press_event.bind(this));
    }

    is_active() {
        return this._current_window != null;
    }

    get_uuid() {
        return this._uuid;
    }

    on_button_press_event(actor, event) {
        if (this._current_window) {
            this._current_window.activate(0);
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

    get_text() {
        return this._label.get_text();
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

