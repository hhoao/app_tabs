import St from 'gi://St';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Logger from './utils/Logger.js';
import {AppTab} from './AppTab.js';
import {get_settings} from '../extension.js';

export const TabPanel = GObject.registerClass({
}, class TabPanel extends PanelMenu.Button {
    _init(props) {
        super._init(1.0, null, true);
        this._config = props.config;
        this._tabs_pool = [];
        this._current_tabs_count = 0;
        this._target_app = null;
        this._update_windows_later_id = 0;
        this._logger = new Logger("TabPanel")

        this.add_style_class_name('app-tabs')
        this.remove_style_class_name('panel-button')
        this._controls = new St.BoxLayout({style_class: 'app-tabs-box'})
        this.add_child(this._controls)
        this._init_tabs();

        Main.overview.connectObject(
            'hiding', this._sync.bind(this),
            'showing', this._reset_all_tabs.bind(this), this);
        Shell.WindowTracker.get_default().connectObject('notify::focus-app',
            this._focus_app_changed.bind(this), this);
        global.window_manager.connectObject('switch-workspace',
            this._sync.bind(this), this);
        global.display.connectObject('notify::focus-window', this.on_focus_window_changed.bind(this), this)
        get_settings().connectObject(
            "changed::ellipsize-mode",
            this._on_ellipsize_mode_changed.bind(this),
            this
        );
        get_settings().connectObject(
            "changed::app-tab-config",
            this._on_app_tab_config_changed.bind(this),
            this
        );
    }

    _on_app_tab_config_changed(settings, key) {
        for (let tab of this._tabs_pool) {
            tab.set_app_tab_config(JSON.parse(get_settings().get_string(key)));
        }
    }

    _on_ellipsize_mode_changed(settings, mode) {
        for (let tab of this._tabs_pool) {
            tab.set_label_ellipsize_mode(get_settings().get_boolean(mode));
        }
    }

    on_focus_window_changed(param) {
        if (param.focus_window != null) {
            this.active_window_tab(param.focus_window)
        }
    }

    active_window_tab(window) {
        for (let i = 0; i < this._current_tabs_count; i++) {
            this._tabs_pool[i].on_active(window);
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
        this._tabs_pool = null;
        this._current_tabs_count = 0;
        this._target_app = null;
        this._update_windows_later_id = 0;
        this._logger = null
        this._controls.destroy();
        this._controls = null;
        super.destroy();
    }

    _init_tabs() {
        this._add_tabs(this._config.tab_panel_config.default_initial_tabs_count);
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
            let divide = new St.Label();
            divide.add_style_class_name('vertical-line');
            divide.hide();

            let app_tab = new AppTab({style_config: JSON.parse(get_settings().get_string("app-tab-config"))});
            app_tab.set_divide(divide)
            app_tab.hide();
            this._controls.add_child(divide);
            this._controls.add_child(app_tab);
            this._tabs_pool.push(app_tab);
        }
    }

    _focus_app_changed() {
        let focused_app = this._find_target_app();
        if (!focused_app) {
            if (global.stage.key_focus != null) {
                return;
            }
        }
        this._sync();
    }

    _find_target_app() {
        let workspace_manager = global.workspace_manager;
        let workspace = workspace_manager.get_active_workspace();
        let tracker = Shell.WindowTracker.get_default();
        let focused_app = tracker.focus_app;
        if (focused_app && focused_app.is_on_workspace(workspace)) {
            return focused_app;
        }
        return null;
    }

    _sync(param) {
        let targetApp = this._find_target_app();
        if (targetApp !== null && (this._target_app !== targetApp || Main.overview === param)) {
            this._reset_all_tabs();
            this._target_app?.disconnectObject(this);

            this._target_app = targetApp;

            this._target_app?.connectObject('windows-changed',
                () => this._queue_update_windows_section(), this);

            this._target_app?.connectObject('notify::busy', this._sync.bind(this), this);
            this._update_windows_section();
        }
    }

    _queue_update_windows_section() {
        if (this._update_windows_later_id)
            return;

        const laters = global.compositor.get_laters();
        this._update_windows_later_id = laters.add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._update_windows_section();
                return GLib.SOURCE_REMOVE;
            });
    }

    _update_windows_section() {
        if (this._update_windows_later_id) {
            const laters = global.compositor.get_laters();
            laters.remove(this._update_windows_later_id);
        }
        this._update_windows_later_id = 0;

        if (!this._target_app) {
            return;
        }

        const windows = this._target_app.get_windows().filter(w => !w.skip_taskbar);
        let info = this._get_windows_info(windows);
        if (info[0].length > 0) {
            this._add_tabs_by_windows(info[0])
        }
        if (info[2].length > 0) {
            this._remove_tab(info[2]);
            this._sort_tab();
        }
        if (info[2].length > 0 || info[0].length > 0) {
            this.on_focus_window_changed(global.display)
        }
    }

    /**
     * @param windows
     * @returns *[][], reserved_tabs_index, removed_tabs_index
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
        tab.set_icon(null);
        tab.fade_out();
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
            tab.set_text(window.get_title() || this._target_app.get_name())
            tab.set_icon(this._target_app.get_icon())
            tab.fade_in()
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
