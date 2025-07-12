import St from 'gi://St';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { AppTab } from './AppTab.js';
import Clutter from 'gi://Clutter';
import { SchemaKeyConstants } from '../src/config/SchemaKeyConstants.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const TabPanel = GObject.registerClass({}, class TabPanel extends PanelMenu.Button {
    _init(props) {
        super._init(1.0, null, true);
        this._settings = props.settings;
        this._desktop_settings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
        this._config = props.config;
        this._tabs_pool = [];
        this._target_app = null;
        this._update_windows_later_id = 0;
        this._current_tabs_count = 0;
        this._menu_manager = new PopupMenu.PopupMenuManager(this);

        // Drag & drop
        this._dragging_tab = null;
        this._drag_placeholder = null;
        this._windows_order = new Map(); // Maps window.get_id() to custom position

        this._load_saved_tabs_order();

        this.add_style_class_name('app-tabs');
        this.remove_style_class_name('panel-button');
        this._scroll_view = this.get_horizontal_scroll_view();
        this.set_panel_max_width(this._settings.get_int(SchemaKeyConstants.PANEL_MAX_WIDTH));
        this.only_display_tabs_on_current_workspace = this._settings.get_boolean(SchemaKeyConstants.ONLY_DISPLAY_TABS_ON_CURRENT_WORKSPACE)

        this._controls = new St.BoxLayout({ style_class: 'app-tabs-box' });
        this._scroll_view.add_child(this._controls);
        this.add_child(this._scroll_view);
        this._init_pool_tabs();

        Main.overview.connectObject(
            'hiding', this._sync.bind(this),
            'showing', this._reset_all_tabs.bind(this), this);
        Shell.WindowTracker.get_default().connectObject('notify::focus-app',
            this._focus_app_changed.bind(this), this);
        global.window_manager.connectObject('switch-workspace',
            this._on_workspace_switched.bind(this), this);
        global.display.connectObject('notify::focus-window', this.on_focus_window_changed.bind(this), this);

        // Detect when GNOME Shell is initialized/restarted
        // Use timeout to execute sync after complete initialization
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._on_shell_startup();
            return GLib.SOURCE_REMOVE;
        });

        // Detect when shell is restarted via Alt+F2+r
        Main.layoutManager.connectObject('startup-complete', this._on_shell_startup.bind(this), this);

        this._listen_settings();
    }

    get_changed_key(key) {
        return 'changed::' + key;
    }

    _listen_settings() {
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.PANEL_MAX_WIDTH),
            this._on_panel_max_width_changed.bind(this),
            this,
        );
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.ONLY_DISPLAY_TABS_ON_CURRENT_WORKSPACE),
            this._on_only_display_tabs_on_current_workspace_changed.bind(this),
            this
        )
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.ELLIPSIZE_MODE),
            this._on_ellipsize_mode_changed.bind(this),
            this,
        );
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.APP_TAB_CONFIG),
            this._on_app_tab_config_changed.bind(this),
            this,
        );
        this._desktop_settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.GTK_THEME),
            this._on_theme_changed.bind(this),
            this,
        );
    }

    _on_only_display_tabs_on_current_workspace_changed(settings, key) {
        this.only_display_tabs_on_current_workspace = settings.get_boolean(key)
    }
    _on_panel_max_width_changed(settings, key) {
        this.set_panel_max_width(settings.get_int(key));
    }

    set_panel_max_width(max_width) {
        if (max_width !== -1) {
            let max_width_style = 'max-width: ' + max_width + 'px';
            this._scroll_view.set_style(max_width_style);
        } else {
            this._scroll_view.set_style('');
        }
    }

    get_horizontal_scroll_view() {
        let scroll_view = new St.ScrollView({
            style_class: 'app-tabs-scroll-view',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.EXTERNAL,
            vscrollbar_policy: St.PolicyType.NEVER,
            enable_mouse_scrolling: false,
        });
        scroll_view.connect('scroll-event', (actor, event) => {
            let scroll_view_adjustment = scroll_view.get_hadjustment();
            let increment_value = 0;
            if (event.get_scroll_direction() === Clutter.ScrollDirection.RIGHT ||
                event.get_scroll_direction() === Clutter.ScrollDirection.DOWN) {
                increment_value = scroll_view_adjustment.step_increment;
            } else if (event.get_scroll_direction() === Clutter.ScrollDirection.LEFT ||
                event.get_scroll_direction() === Clutter.ScrollDirection.UP) {
                increment_value = -scroll_view_adjustment.step_increment;
            }

            scroll_view_adjustment.set_value(scroll_view_adjustment.get_value() + increment_value);
        });
        return scroll_view;
    }

    _on_theme_changed(settings, key) {
        for (let tab of this._tabs_pool) {
            tab.set_theme(settings.get_string(key));
        }
    }

    _on_app_tab_config_changed(settings, key) {
        for (let tab of this._tabs_pool) {
            tab.set_app_tab_config(JSON.parse(this._settings.get_string(key)));
        }
    }

    _on_ellipsize_mode_changed(settings, mode) {
        for (let tab of this._tabs_pool) {
            tab.switch_label_ellipsize_mode(settings.get_boolean(mode));
        }
    }

    on_focus_window_changed(param) {
        if (param.focus_window != null) {
            this.active_window_tab(param.focus_window);
        }
    }

    /**
     * @param window Meta.Window
     */
    active_window_tab(window) {
        for (let i = 0; i < this._current_tabs_count; i++) {
            this._tabs_pool[i].on_active(window);
        }
    } destroy() {
        this._cancel_drag_preparation();

        // Clear global drag events if still active
        if (this._stage_motion_id) {
            global.stage.disconnect(this._stage_motion_id);
            this._stage_motion_id = null;
        }
        if (this._stage_release_id) {
            global.stage.disconnect(this._stage_release_id);
            this._stage_release_id = null;
        }

        // Clear placeholder if it still exists
        if (this._drag_placeholder && this._drag_placeholder.get_parent()) {
            this._drag_placeholder.get_parent().remove_child(this._drag_placeholder);
            this._drag_placeholder = null;
        }

        this._scroll_view?.disconnectObject(this);
        this._desktop_settings?.disconnectObject(this);
        this._settings?.disconnectObject(this);
        Main.overview?.disconnectObject(this);
        global.display?.disconnectObject(this);
        global.window_manager?.disconnectObject(this);
        Shell.WindowTracker?.get_default().disconnectObject(this);
        Shell.AppSystem.get_default()?.disconnectObject(this);
        Main.layoutManager?.disconnectObject(this);
        for (let tab of this._tabs_pool) {
            tab.destroy();
        }
        this._controls.destroy();
        this._scroll_view.destroy();

        this._menu_manager = null;
        this._scroll_view = null;
        this._desktop_settings = null;
        this._settings = null;
        this._tabs_pool = null;
        this._current_tabs_count = null;
        this._target_app = null;
        this._update_windows_later_id = null;
        this._controls = null;
        super.destroy();
    }

    _reset_all_tabs() {
        let tab_count = this._current_tabs_count;
        let tmp_tab_list = [];
        for (let i = 0; i < tab_count; i++) {
            tmp_tab_list.push(this._tabs_pool[i]);
        }
        tmp_tab_list.forEach((tab) => {
            this._reset_tab(tab);
        });
    }

    _init_pool_tabs() {
        this._add_pool_tabs(this._config.tab_panel_config.default_initial_tabs_count);
    }

    _add_pool_tabs(count) {
        for (let i = 0; i < count; i++) {
            let divide = new St.Label();
            divide.add_style_class_name('vertical-line');
            divide.hide();

            let app_tab = new AppTab({
                style_config: JSON.parse(this._settings.get_string(SchemaKeyConstants.APP_TAB_CONFIG)),
                is_dark_mode: this._desktop_settings.get_string(SchemaKeyConstants.GTK_THEME),
                settings: this._settings,
                menu_manager: this._menu_manager,
            });
            app_tab.set_divide(divide);
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

    _on_workspace_switched() {
        this._target_app = null;
        this._reset_all_tabs();
        this._sync();
    }

    _on_shell_startup() {
        this._reset_all_tabs();
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
        if ((targetApp !== null && this._target_app !== targetApp) || Main.overview === param) {
            this._reset_all_tabs();
            this._target_app?.disconnectObject(this);

            this._target_app = targetApp;

            this._target_app?.connectObject('windows-changed',
                this._queue_update_windows_section.bind(this), this);

            this._update_windows_section(this._target_app);
        }
    }

    _queue_update_windows_section() {
        if (this._update_windows_later_id)
            return;

        const laters = global.compositor.get_laters();
        this._update_windows_later_id = laters.add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._latter_update_windows_session(this._target_app);
                return GLib.SOURCE_REMOVE;
            });
    }

    _latter_update_windows_session(app) {
        if (this._update_windows_later_id) {
            const laters = global.compositor.get_laters();
            laters.remove(this._update_windows_later_id);
        }
        this._update_windows_later_id = 0;
        this._update_windows_section(app);
    }

    /**
     * @param app Shell.App
     * @private
     */
    _update_windows_section(app) {
        if (this._update_windows_later_id) {
            const laters = global.compositor.get_laters();
            laters.remove(this._update_windows_later_id);
        }
        this._update_windows_later_id = 0;

        if (!app) {
            return;
        }

        let windows;
        if (this.only_display_tabs_on_current_workspace) {
            let workspace_manager = global.workspace_manager;
            let workspace = workspace_manager.get_active_workspace();
            windows = app.get_windows().filter(w => !w.skip_taskbar && w.get_workspace() === workspace);
        } else {
            windows = app.get_windows().filter(w => !w.skip_taskbar);
        }
        let info = this._get_windows_info(windows);
        if (info[0].length > 0) {
            this._add_tabs_by_windows(app, info[0]);
        }
        if (info[2].length > 0) {
            this._remove_tab(info[2]);
        }
        if (info[2].length > 0 || info[0].length > 0) {
            this.on_focus_window_changed(global.display);
        }
    }

    /**
     * @param windows
     * @returns *[][], reserved_tabs_index, removed_tabs_index
     * @private
     */
    _get_windows_info(windows) {
        let add_tabs = [];
        let reserved_tabs_index = [];
        let removed_tabs_index = [];
        for (let i = 0; i < this._current_tabs_count; i++) {
            let store_window = this._tabs_pool[i].get_current_window();
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
        let currentWindow = tab.get_current_window();
        currentWindow?.disconnectObject(tab);
        tab.set_current_window(null);
        this._current_tabs_count--;
        this._controls.set_child_above_sibling(tab, null);
        this._controls.set_child_above_sibling(tab.get_divide(), null);
        this._tabs_pool.splice(this._tabs_pool.indexOf(tab), 1);
        this._tabs_pool.push(tab);
    }

    /**
     * @param windows Needs to be added windows
     */
    _add_tabs_by_windows(app, windows) {
        if (this._current_tabs_count + windows.length > this._tabs_pool.length) {
            this._add_pool_tabs(this._current_tabs_count + windows.length - this._tabs_pool.length);
        }

        // Sort windows based on custom order or natural order
        let sorted_windows = this._sort_windows_by_custom_order(windows);

        sorted_windows.forEach((window) => {
            let tab = this._tabs_pool[this._current_tabs_count];
            tab.set_text(window.get_title() || app.get_name());
            tab.set_icon(app.get_icon());
            tab.fade_in();
            window.connectObject('notify::title', () => {
                tab.set_text(window.get_title() || this._app.get_name());
            }, tab);
            tab.set_current_window(window);
            this._setup_tab_drag_and_drop(tab);

            tab.connect('move-tab', (tab, direction) => {
                this._move_tab_by_direction(tab, direction);
            });

            tab.connect('close-tab', () => {
                this._on_tab_close_button_clicked(tab);
            });

            // Detect when window is closed
            window.connectObject('unmanaged', () => {
                let corresponding_tab = this._find_tab_by_window(window);
                if (corresponding_tab) {
                    this._reset_tab(corresponding_tab);
                } else {
                }

                window.connectObject('workspace-changed', () => {
                    if (this.only_display_tabs_on_current_workspace) {
                        this._force_update_tabs();
                    }
                }, this);
                // Listener for workspace changes (if setting is active)
                window.connectObject('workspace-changed', () => {
                    if (this.only_display_tabs_on_current_workspace) {
                        this._force_update_tabs();
                    }
                }, this);
            }, this);

            window.connectObject('workspace-changed', () => {
                if (this.only_display_tabs_on_current_workspace) {
                    this._force_update_tabs();
                }
            }, this);

            this._current_tabs_count++;
        });
    }

    _sort_windows_by_custom_order(windows) {
        return windows.slice().sort((a, b) => {
            let order_a = this._windows_order.get(a.get_id()) ?? 999999;
            let order_b = this._windows_order.get(b.get_id()) ?? 999999;
            return order_a - order_b;
        });
    }

    _setup_tab_drag_and_drop(tab) {
        tab.reactive = true;
        tab._draggable = true;

        tab.connect('button-press-event', (actor, event) => {
            if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                // Verify if Ctrl is pressed
                if (event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
                    this._show_hello_world_popup(tab);
                    return Clutter.EVENT_STOP;
                } else {
                    this._prepare_drag(tab, event);
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        tab.connect('button-release-event', (actor, event) => {
            this._cancel_drag_preparation();
            if (this._dragging_tab === tab) {
                this._end_drag(tab);
            }
            return Clutter.EVENT_PROPAGATE;
        });

        tab.connect('motion-event', (actor, event) => {
            if (this._drag_prepared && this._drag_prepared_tab === tab) {
                this._check_drag_threshold(tab, event);
            } else if (this._dragging_tab === tab) {
                this._handle_drag_motion(tab, event);
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _prepare_drag(tab, event) {
        this._cancel_drag_preparation();
        this._drag_prepared = true;
        this._drag_prepared_tab = tab;
        this._drag_start_position = event.get_coords();
        this._drag_threshold = 5; // 5px of threshold
    }

    _check_drag_threshold(tab, event) {
        if (!this._drag_prepared) return;

        let [current_x, current_y] = event.get_coords();
        let [start_x, start_y] = this._drag_start_position;

        let distance = Math.sqrt(
            Math.pow(current_x - start_x, 2) +
            Math.pow(current_y - start_y, 2)
        );

        if (distance >= this._drag_threshold) {
            this._cancel_drag_preparation();
            this._start_drag(tab);
        }
    }

    _cancel_drag_preparation() {
        this._drag_prepared = false;
        this._drag_prepared_tab = null;
        this._drag_start_position = null;
        this._drag_threshold = null;
    }

    _start_drag(tab) {
        this._dragging_tab = tab;
        tab.add_style_class_name('app-tab-dragging');
        this._initial_drag_position = this._get_tab_index(tab);

        // Capture current cursor position at the moment drag starts
        let [current_mouse_x, current_mouse_y] = global.get_pointer();

        // Save initial tab position for offset calculations
        this._drag_start_tab_position = tab.get_transformed_position()[0];
        this._drag_start_mouse_position = current_mouse_x; // Use current cursor position

        // Update saved drag_start_position to current position
        this._drag_start_position = [current_mouse_x - 4, current_mouse_y];

        this._create_drag_clone(tab);

        // Capture global events to detect movement and release
        this._stage_motion_id = global.stage.connect('motion-event', this._on_stage_motion.bind(this));
        this._stage_release_id = global.stage.connect('button-release-event', this._on_stage_release.bind(this));
    }

    _create_drag_clone(tab) {
        // Save original Y position to keep tab at same level
        this._original_tab_y = tab.get_y();

        tab.opacity = 255;

        // Remove tab from original position temporarily
        let divide = tab.get_divide();
        this._original_tab_parent = this._controls;
        this._original_tab_index = this._controls.get_children().indexOf(tab);
        this._original_divide_index = this._controls.get_children().indexOf(divide);

        this._create_placeholder(tab);
    }

    _create_placeholder(tab) {
        this._drag_placeholder = new St.Widget({
            width: tab.get_width() - 4,
            height: tab.get_height() - 4,
            style_class: 'app-tab-placeholder'
        });

        let tab_index = this._controls.get_children().indexOf(tab);
        this._controls.insert_child_at_index(this._drag_placeholder, tab_index);

        // Move tab to Main.uiGroup so it can float over everything
        this._controls.remove_child(tab);
        this._controls.remove_child(tab.get_divide());
        Main.uiGroup.add_child(tab);

        // Calculate initial position based on current cursor
        let current_mouse_x = this._drag_start_position[0];
        let offset_x = current_mouse_x - this._drag_start_mouse_position;
        let initial_x = this._drag_start_tab_position + offset_x;

        // Position tab exactly where cursor is
        tab.set_position(initial_x, this._original_tab_y);
    }

    /** Handle global motion events during the drag */
    _on_stage_motion(actor, event) {
        if (this._dragging_tab) {
            this._handle_drag_motion(this._dragging_tab, event);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    /** Handle global release during the drag */
    _on_stage_release(actor, event) {
        if (this._dragging_tab) {
            this._end_drag(this._dragging_tab);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _handle_drag_motion(tab, event) {
        let [x, y] = event.get_coords();

        let offset_x = x - this._drag_start_mouse_position;
        let new_x = this._drag_start_tab_position + offset_x;
        tab.set_position(new_x - 4, this._original_tab_y);  // -4 because of border 2px on each side

        // Find ideal position based on mouse
        let visible_tabs = this._get_visible_tabs().filter(t => t !== tab);
        let target_index = this._find_closest_tab_index(x, visible_tabs);

        // Update placeholder position if needed
        this._update_placeholder_position(target_index);
    }

    _update_placeholder_position(target_index) {
        if (!this._drag_placeholder) return;

        let current_index = this._controls.get_children().indexOf(this._drag_placeholder);
        let desired_index = target_index * 2; // x2 because of separators

        if (Math.floor(current_index / 2) !== target_index) {
            this._controls.remove_child(this._drag_placeholder);

            let children = this._controls.get_children();
            if (desired_index >= children.length) {
                this._controls.add_child(this._drag_placeholder);
            } else {
                this._controls.insert_child_at_index(this._drag_placeholder, desired_index);
            }
        }
    }

    _find_closest_tab_index(x, visible_tabs) {
        for (let i = 0; i < visible_tabs.length; i++) {
            let tab = visible_tabs[i];
            let [tab_x, tab_y] = tab.get_transformed_position();
            let tab_width = tab.get_width();

            if (x < tab_x + tab_width / 2) {
                return i;
            }
        }
        return visible_tabs.length;
    }

    _move_tab_to_position(tab, target_index) {
        let divide = tab.get_divide();

        // Remove from current position
        this._controls.remove_child(divide);
        this._controls.remove_child(tab);

        // Insert at new position
        let children = this._controls.get_children();
        let insert_at = target_index * 2; // *2 because of separators

        if (insert_at >= children.length) {
            this._controls.add_child(divide);
            this._controls.add_child(tab);
        } else {
            this._controls.insert_child_at_index(divide, insert_at);
            this._controls.insert_child_at_index(tab, insert_at + 1);
        }
    }

    _get_tab_index(tab) {
        let visible_tabs = this._get_visible_tabs();
        return visible_tabs.indexOf(tab);
    }

    _end_drag(tab) {
        if (!this._dragging_tab) return;

        tab.remove_style_class_name('app-tab-dragging');
        tab.opacity = 255;

        Main.uiGroup.remove_child(tab);

        // Find where to insert the tab based on the placeholder position
        let placeholder_index = this._controls.get_children().indexOf(this._drag_placeholder);
        let target_index = Math.floor(placeholder_index / 2);

        // Remove placeholder
        if (this._drag_placeholder) {
            this._controls.remove_child(this._drag_placeholder);
            this._drag_placeholder = null;
        }

        this._insert_tab_at_position(tab, target_index);

        // Update saved order based on final position
        this._update_saved_order_from_current_positions();

        // Clear drag state
        this._dragging_tab = null;
        this._initial_drag_position = null;
        this._drag_start_tab_position = null;
        this._drag_start_mouse_position = null;
        this._original_tab_y = null;

        // Remove global event listeners
        if (this._stage_motion_id) {
            global.stage.disconnect(this._stage_motion_id);
            this._stage_motion_id = null;
        }
        if (this._stage_release_id) {
            global.stage.disconnect(this._stage_release_id);
            this._stage_release_id = null;
        }
    }

    _insert_tab_at_position(tab, target_index) {
        let divide = tab.get_divide();
        let children = this._controls.get_children();
        let insert_at = target_index * 2; // *2 because of separators

        if (insert_at >= children.length) {
            this._controls.add_child(divide);
            this._controls.add_child(tab);
        } else {
            this._controls.insert_child_at_index(divide, insert_at);
            this._controls.insert_child_at_index(tab, insert_at + 1);
        }

        tab.set_position(0, 0);
    }

    _update_saved_order_from_current_positions() {
        let visible_tabs = this._get_visible_tabs();
        visible_tabs.forEach((tab, index) => {
            let window = tab.get_current_window();
            if (window) {
                this._windows_order.set(window.get_id(), index);
            }
        });
        this._save_tabs_order();
    }

    _reorder_tab(tab, new_index) {
        let visible_tabs = this._get_visible_tabs();
        let current_index = visible_tabs.indexOf(tab);

        if (current_index === -1 || current_index === new_index) return;

        // Update custom order
        this._update_windows_order(visible_tabs, current_index, new_index);

        // Reorder visually
        this._reorder_tabs_visually();
    }

    _get_visible_tabs() {
        return this._controls.get_children().filter(child =>
            child instanceof AppTab && child.visible
        );
    }

    _update_windows_order(visible_tabs, from_index, to_index) {
        let moved_tab = visible_tabs.splice(from_index, 1)[0];
        visible_tabs.splice(to_index, 0, moved_tab);

        visible_tabs.forEach((tab, index) => {
            let window = tab.get_current_window();
            if (window) {
                this._windows_order.set(window.get_id(), index);
            }
        });

        this._save_tabs_order();
    }

    _reorder_tabs_visually() {
        let visible_tabs = this._get_visible_tabs();

        // Remove tab from container
        visible_tabs.forEach(tab => {
            let divide = tab.get_divide();
            this._controls.remove_child(divide);
            this._controls.remove_child(tab);
        });

        // Sort by custom order
        let sorted_tabs = visible_tabs.slice().sort((a, b) => {
            let window_a = a.get_current_window();
            let window_b = b.get_current_window();
            let order_a = window_a ? this._windows_order.get(window_a.get_id()) ?? 999999 : 999999;
            let order_b = window_b ? this._windows_order.get(window_b.get_id()) ?? 999999 : 999999;
            return order_a - order_b;
        });

        // Add again in sorted order
        sorted_tabs.forEach(tab => {
            let divide = tab.get_divide();
            this._controls.add_child(divide);
            this._controls.add_child(tab);
        });
    }

    _move_tab_by_direction(tab, direction) {
        let visible_tabs = this._get_visible_tabs();
        let current_index = visible_tabs.indexOf(tab);

        if (current_index === -1) return;

        let new_index = current_index + direction;
        new_index = Math.max(0, Math.min(new_index, visible_tabs.length - 1));

        if (new_index !== current_index) {
            this._reorder_tab(tab, new_index);
        }
    }

    _load_saved_tabs_order() {
        try {
            let saved_order = this._settings.get_string(SchemaKeyConstants.TABS_ORDER);
            if (saved_order) {
                let order_data = JSON.parse(saved_order);
                for (let window_id in order_data) {
                    this._windows_order.set(parseInt(window_id), order_data[window_id]);
                }
            }
        } catch (e) {
            this._windows_order.clear();
        }
    }

    _save_tabs_order() {
        try {
            let order_data = {};
            for (let [window_id, position] of this._windows_order.entries()) {
                order_data[window_id] = position;
            }
            this._settings.set_string(SchemaKeyConstants.TABS_ORDER, JSON.stringify(order_data));
        } catch (e) {
        }
    }

    _show_hello_world_popup(tab) {
        try {
            Main.notify("Hello World!", "Ctrl+clique detectado na guia! Executando sync...");

        } catch (error) {
            console.log('Hello World! Ctrl+clique detectado na guia! Executando sync...');
        }

        this._focus_app_changed();
    }

    _find_tab_by_window(window) {
        for (let i = 0; i < this._current_tabs_count; i++) {
            let tab = this._tabs_pool[i];
            if (tab.get_current_window() === window) {
                return tab;
            }
        }
        return null;
    }

    _on_tab_close_button_clicked(tab) {
        try {
            this._reset_tab(tab);
        } catch (error) {
        }
    }

    _on_window_removed(display, window) {
        // this._show_window_closed_popup(window);
        this._force_update_tabs();
    }

    _on_window_closed(display, window) {
        this._force_update_tabs();
    }

    _show_window_closed_popup(window) {
        try {
            let window_title = window ? window.get_title() : 'Desconhecida';
            let message = `Janela fechada: ${window_title}`;

            Main.notify('Application Tabs', message, null);
        } catch (e) {
            Main.notify('Application Tabs', 'Janela fechada', null);
        }
    }
});
