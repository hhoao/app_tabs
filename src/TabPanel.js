import St from 'gi://St';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { AppTab } from './AppTab.js';
import { TabControls } from './TabControls.js';
import Clutter from 'gi://Clutter';
import { SchemaKeyConstants } from '../src/config/SchemaKeyConstants.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { shouldStartPreparedDrag } from './utils/DragPreparation.js';
import { isDarkTheme } from './utils/ThemeStyle.js';
import {
    createWindowSnapshot,
    recordRecentSnapshot,
    restoreRecentWindowsState,
    serializeRecentWindowsState,
} from './utils/WindowSessionStore.js';
import {
    getProcessLaunchContext,
    shouldUseCommandForRestore,
} from './utils/ProcessLaunchContext.js';
import { FloatingBar } from './FloatingBar.js';
import { AppTabMenuStrings } from './locale/AppTabMenuStrings.js';
import {
    addOrUpdateStandaloneApplication,
    removeStandaloneApplication,
    restoreStandaloneApplications,
    serializeStandaloneApplications,
    standaloneApplicationIncludes,
} from './utils/StandaloneApplications.js';

const RECENT_WINDOWS_MENU_MAX_HEIGHT = 520;
const RECENT_CLOSED_DISPLAY_LIMIT = 10;
const RECENT_WINDOW_LABEL_MAX_LENGTH = 42;
const DISPLAY_MODE_TOGGLE_ROLE = 'AppTabsDisplayModeToggle';

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
        this._recent_windows_state = restoreRecentWindowsState(
            this._settings.get_string(SchemaKeyConstants.RECENT_WINDOWS_STATE)
        );
        this._standalone_applications = restoreStandaloneApplications(
            this._settings.get_string(SchemaKeyConstants.STANDALONE_APPLICATIONS)
        );
        this._panel_applications = restoreStandaloneApplications(
            this._settings.get_string(SchemaKeyConstants.PANEL_APPLICATIONS)
        );
        this._pending_restore_snapshots = [];

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
        this.show_add_tab_button = this._settings.get_boolean(SchemaKeyConstants.SHOW_ADD_TAB_BUTTON);
        this.show_recent_windows_menu = this._settings.get_boolean(SchemaKeyConstants.SHOW_RECENT_WINDOWS_MENU);
        this._display_mode = this._settings.get_string(SchemaKeyConstants.DISPLAY_MODE);
        this._saved_panel_index = 0;
        this._floating_bar = null;
        this._panel_display_mode_toggle = null;
        this._topbar_was_hidden = false;
        this._topbar_chrome_adjusted = false;
        this._topbar_base_y = 0;
        this._switching_display_mode = false;
        this._refreshing_display_mode_menu = false;

        this._tab_controls = new TabControls({
            isDarkMode: this._is_dark_mode(),
            panelHeight: this._get_panel_height(),
            onAddTab: this._open_new_tab_for_target_app.bind(this),
            onShowRecentWindows: this._toggle_recent_windows_menu.bind(this),
            onToggleDisplayMode: this.toggle_display_mode.bind(this),
            onShowDisplayModeMenu: this._toggle_display_mode_menu.bind(this),
        });
        this._scroll_view.add_child(this._tab_controls.actor);
        this._tab_panel_container = new St.BoxLayout({ style_class: 'app-tabs-container' });
        this._tab_panel_container.add_child(this._tab_controls.get_recent_windows_button());
        this._tab_panel_container.add_child(this._tab_controls.get_recent_windows_divider());
        this._tab_panel_container.add_child(this._scroll_view);
        this._tab_panel_container.add_child(this._tab_controls.get_add_tab_divider());
        this._tab_panel_container.add_child(this._tab_controls.get_add_tab_button());
        this.add_child(this._tab_panel_container);
        this._init_pool_tabs();
        this._init_recent_windows_menu();
        this._init_display_mode_menu();
        this._tab_controls.set_recent_windows_visible(this.show_recent_windows_menu);

        Main.overview.connectObject(
            'hiding', () => {
                this._sync();
                if (this._topbar_was_hidden)
                    this._hide_topbar_for_standalone();
            },
            'showing', () => {
                this._reset_all_tabs();
                if (this._topbar_was_hidden)
                    this._show_topbar_temporarily();
            }, this);
        Shell.WindowTracker.get_default().connectObject('notify::focus-app',
            this._focus_app_changed.bind(this), this);
        global.window_manager.connectObject('switch-workspace',
            this._on_workspace_switched.bind(this), this);
        global.display.connectObject('notify::focus-window', this.on_focus_window_changed.bind(this), this);
        global.display.connectObject('window-created', this._on_window_created.bind(this), this);
        Main.panel.connectObject(
            'notify::height', this._on_panel_height_changed.bind(this),
            'style-changed', this._on_panel_height_changed.bind(this),
            this);

        // Detect when GNOME Shell is initialized/restarted
        // Use timeout to execute sync after complete initialization
        this._init_timeout_id= GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._on_shell_startup();
            return GLib.SOURCE_REMOVE;
        });

        // Detect when shell is restarted via Alt+F2+r
        Main.layoutManager.connectObject('startup-complete', this._on_shell_startup.bind(this), this);

        this._listen_settings();

        if (this._display_mode === 'standalone')
            this._init_standalone_display();
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
            this.get_changed_key(SchemaKeyConstants.SHOW_ADD_TAB_BUTTON),
            this._on_show_add_tab_button_changed.bind(this),
            this,
        );
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.SHOW_RECENT_WINDOWS_MENU),
            this._on_show_recent_windows_menu_changed.bind(this),
            this,
        );
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
        if (this._desktop_setting_has_key(SchemaKeyConstants.COLOR_SCHEME)) {
            this._desktop_settings.connectObject(
                this.get_changed_key(SchemaKeyConstants.COLOR_SCHEME),
                this._on_theme_changed.bind(this),
                this,
            );
        }
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
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.STANDALONE_APPLICATIONS),
            this._on_standalone_applications_changed.bind(this),
            this,
        );
        this._settings.connectObject(
            this.get_changed_key(SchemaKeyConstants.PANEL_APPLICATIONS),
            this._on_panel_applications_changed.bind(this),
            this,
        );
    }

    _on_only_display_tabs_on_current_workspace_changed(settings, key) {
        this.only_display_tabs_on_current_workspace = settings.get_boolean(key)
    }

    _on_show_add_tab_button_changed(settings, key) {
        this.show_add_tab_button = settings.get_boolean(key);
        this._update_add_tab_visibility(this._current_tabs_count > 0);
    }

    _on_show_recent_windows_menu_changed(settings, key) {
        this.show_recent_windows_menu = settings.get_boolean(key);
        this._tab_controls.set_recent_windows_visible(this.show_recent_windows_menu);
    }

    _on_standalone_applications_changed(settings, key) {
        this._standalone_applications = restoreStandaloneApplications(settings.get_string(key));
        this._refresh_display_mode_menu();
        this._apply_display_mode_for_target_app();
    }

    _on_panel_applications_changed(settings, key) {
        this._panel_applications = restoreStandaloneApplications(settings.get_string(key));
        this._refresh_display_mode_menu();
        this._apply_display_mode_for_target_app();
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

    _desktop_setting_has_key(key) {
        return this._desktop_settings.settings_schema?.has_key(key) ?? false;
    }

    _get_desktop_setting_string(key) {
        if (!this._desktop_setting_has_key(key))
            return '';

        return this._desktop_settings.get_string(key);
    }

    _get_theme_state() {
        return {
            gtkTheme: this._get_desktop_setting_string(SchemaKeyConstants.GTK_THEME),
            colorScheme: this._get_desktop_setting_string(SchemaKeyConstants.COLOR_SCHEME),
        };
    }

    _is_dark_mode() {
        return isDarkTheme(this._get_theme_state());
    }

    _get_panel_height() {
        return Main.panel.get_height?.() ?? Main.panel.height ?? 30;
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
        let themeState = this._get_theme_state();
        for (let tab of this._tabs_pool) {
            tab.set_theme(themeState);
        }
        this._tab_controls.set_theme({
            isDarkMode: this._is_dark_mode(),
            panelHeight: this._get_panel_height(),
        });
    }

    _on_panel_height_changed() {
        let panelHeight = this._get_panel_height();
        for (let tab of this._tabs_pool) {
            tab.set_panel_height(panelHeight);
        }
        this._tab_controls.set_theme({
            isDarkMode: this._is_dark_mode(),
            panelHeight,
        });
    }

    _on_app_tab_config_changed(settings, key) {
        for (let tab of this._tabs_pool) {
            tab.set_app_tab_config(JSON.parse(this._settings.get_string(key)));
        }
    }

    _open_new_tab_for_target_app() {
        if (!this._target_app?.can_open_new_window?.())
            return;

        this._target_app.open_new_window(-1);
    }

    _init_display_mode_menu() {
        this._display_mode_menu = new PopupMenu.PopupMenu(
            this._tab_controls.get_display_mode_toggle_button(),
            0.0,
            St.Side.TOP
        );
        this._display_mode_menu.actor.add_style_class_name('panel-menu');
        this._fixed_standalone_menu_item = new PopupMenu.PopupSwitchMenuItem(
            AppTabMenuStrings.fixedStandaloneForCurrentApplication,
            false
        );
        this._fixed_standalone_menu_item.connect('toggled', (_item, state) => {
            this._set_target_app_fixed_display_mode('standalone', state);
        });
        this._fixed_panel_menu_item = new PopupMenu.PopupSwitchMenuItem(
            AppTabMenuStrings.fixedPanelForCurrentApplication,
            false
        );
        this._fixed_panel_menu_item.connect('toggled', (_item, state) => {
            this._set_target_app_fixed_display_mode('panel', state);
        });
        this._display_mode_menu.addMenuItem(this._fixed_standalone_menu_item);
        this._display_mode_menu.addMenuItem(this._fixed_panel_menu_item);
        Main.uiGroup.add_child(this._display_mode_menu.actor);
        this._display_mode_menu.actor.hide();
        this._menu_manager.addMenu(this._display_mode_menu);
    }

    _toggle_display_mode_menu() {
        if (!this._display_mode_menu)
            return;

        this._refresh_display_mode_menu();
        this._display_mode_menu.toggle();
    }

    _refresh_display_mode_menu() {
        if (!this._fixed_standalone_menu_item || !this._fixed_panel_menu_item)
            return;

        let appId = this._target_app?.get_id?.() ?? '';
        let hasTargetApp = Boolean(appId);
        this._refreshing_display_mode_menu = true;
        this._fixed_standalone_menu_item.setSensitive(hasTargetApp);
        this._fixed_panel_menu_item.setSensitive(hasTargetApp);
        this._fixed_standalone_menu_item.setToggleState(
            standaloneApplicationIncludes(this._standalone_applications, appId)
        );
        this._fixed_panel_menu_item.setToggleState(
            standaloneApplicationIncludes(this._panel_applications, appId)
        );
        this._refreshing_display_mode_menu = false;
    }

    _set_target_app_fixed_display_mode(mode, isFixed) {
        if (this._refreshing_display_mode_menu)
            return;

        let record = this._create_standalone_application_record(this._target_app);
        if (!record.appId)
            return;

        let standaloneRecords = removeStandaloneApplication(this._standalone_applications, record.appId);
        let panelRecords = removeStandaloneApplication(this._panel_applications, record.appId);
        if (isFixed && mode === 'standalone')
            standaloneRecords = addOrUpdateStandaloneApplication(standaloneRecords, record);
        if (isFixed && mode === 'panel')
            panelRecords = addOrUpdateStandaloneApplication(panelRecords, record);

        this._settings.set_string(
            SchemaKeyConstants.STANDALONE_APPLICATIONS,
            serializeStandaloneApplications(standaloneRecords)
        );
        this._settings.set_string(
            SchemaKeyConstants.PANEL_APPLICATIONS,
            serializeStandaloneApplications(panelRecords)
        );

        this._apply_display_mode_for_target_app();
    }

    _create_standalone_application_record(app) {
        let icon = app?.get_icon?.();
        return {
            appId: app?.get_id?.() ?? '',
            name: app?.get_name?.() ?? app?.get_id?.() ?? '',
            iconName: icon?.get_names?.()?.[0] ?? icon?.to_string?.() ?? '',
        };
    }

    _init_recent_windows_menu() {
        this._recent_windows_menu = new PopupMenu.PopupMenu(
            this._tab_controls.get_recent_windows_button(),
            0.0,
            St.Side.TOP
        );
        this._recent_windows_menu.actor.add_style_class_name('panel-menu');
        this._recent_windows_scroll_view = new St.ScrollView({
            style_class: 'app-tabs-recent-windows-scroll-view',
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
        });
        this._recent_windows_scroll_view.set_style('max-height: 520px;');
        this._recent_windows_section = new PopupMenu.PopupMenuSection();
        this._recent_windows_scroll_view.add_child(this._recent_windows_section.actor);
        this._recent_windows_menu.box.add_child(this._recent_windows_scroll_view);
        this._connect_recent_windows_scroll_handler(this._recent_windows_scroll_view);
        this._connect_recent_windows_scroll_handler(this._recent_windows_section.actor);
        Main.uiGroup.add_child(this._recent_windows_menu.actor);
        this._recent_windows_menu.actor.hide();
        this._menu_manager.addMenu(this._recent_windows_menu);
        this._recent_windows_menu.connect('open-state-changed', (_menu, isOpen) => {
            if (!isOpen)
                this._hide_recent_window_tooltip();
        });
        this._init_recent_windows_tooltip();
    }

    _init_recent_windows_tooltip() {
        this._recent_windows_tooltip = new St.Label({
            style_class: 'app-tabs-recent-window-tooltip',
            visible: false,
        });
        this._recent_windows_tooltip.set_style(
            'max-width: 480px;padding:8px 10px;border-radius:8px;' +
            'background-color:rgba(32,32,32,0.96);color:white;'
        );
        Main.uiGroup.add_child(this._recent_windows_tooltip);
    }

    _toggle_recent_windows_menu() {
        this._refresh_recent_windows_menu();
        this._recent_windows_menu.toggle();
    }

    _refresh_recent_windows_menu() {
        this._recent_windows_section.removeAll();

        let currentApplicationWindows = this._get_current_application_windows();
        this._add_recent_windows_submenu(
            AppTabMenuStrings.currentApplicationWindows,
            currentApplicationWindows.map(window => {
                let app = this._get_app_for_window(window);
                return {
                    title: window.get_title() || app?.get_name?.() || '',
                    appName: app?.get_name?.() || '',
                    timestamp: Date.now(),
                    icon: app?.get_icon?.() ?? null,
                    _window: window,
                };
            }),
            item => {
                item._window?.activate(global.get_current_time());
            },
            AppTabMenuStrings.noCurrentWindows,
            'focus-windows-symbolic'
        );

        let allApplicationWindows = this._get_all_application_windows();
        this._add_recent_windows_submenu(
            AppTabMenuStrings.currentAllApplicationsWindows,
            allApplicationWindows.map(window => {
                let app = this._get_app_for_window(window);
                return {
                    title: window.get_title() || app?.get_name?.() || '',
                    appName: app?.get_name?.() || '',
                    timestamp: Date.now(),
                    icon: app?.get_icon?.() ?? null,
                    _window: window,
                };
            }),
            item => {
                item._window?.activate(global.get_current_time());
            },
            AppTabMenuStrings.noCurrentWindows,
            'focus-windows-symbolic'
        );

        this._add_recent_windows_submenu(
            AppTabMenuStrings.recentlyClosedWindows,
            this._recent_windows_state.closed.slice(0, RECENT_CLOSED_DISPLAY_LIMIT),
            snapshot => this._restore_recent_window_snapshot(snapshot),
            AppTabMenuStrings.noRecentlyClosedWindows,
            'window-close-symbolic'
        );
    }

    _add_recent_windows_submenu(title, items, onActivate, emptyText, iconName) {
        let submenu = new PopupMenu.PopupSubMenuMenuItem(`${title} (${items.length})`);
        this._recent_windows_section.addMenuItem(submenu);
        this._connect_recent_windows_scroll_handler(submenu);
        this._connect_recent_windows_scroll_handler(submenu.menu.actor);

        if (!items.length) {
            let emptyItem = this._add_icon_menu_item(emptyText, 'window-close-symbolic');
            emptyItem.setSensitive(false);
            submenu.menu.addMenuItem(emptyItem);
            this._connect_recent_windows_scroll_handler(emptyItem);
            submenu.setSubmenuShown?.(true);
            submenu.menu.open(false);
            return;
        }

        for (let item of items) {
            let tooltipText = this._format_recent_window_label(item);
            let menuItem = this._add_icon_menu_item(
                this._truncate_recent_window_label(tooltipText),
                item.icon ?? item.iconName ?? iconName
            );
            this._bind_recent_window_tooltip(menuItem, tooltipText);
            menuItem.connect('activate', () => {
                onActivate(item);
            });
            submenu.menu.addMenuItem(menuItem);
            this._connect_recent_windows_scroll_handler(menuItem);
        }
        submenu.setSubmenuShown?.(true);
        submenu.menu.open(false);
    }

    _add_icon_menu_item(label, iconSource) {
        let item = new PopupMenu.PopupMenuItem(label);
        this._add_icon_to_menu_item(item, iconSource);
        return item;
    }

    _truncate_recent_window_label(label) {
        if (label.length <= RECENT_WINDOW_LABEL_MAX_LENGTH)
            return label;

        return `${label.slice(0, RECENT_WINDOW_LABEL_MAX_LENGTH - 1)}…`;
    }

    _bind_recent_window_tooltip(item, tooltipText) {
        item.connect('notify::hover', () => {
            if (item.hover)
                this._show_recent_window_tooltip(item, tooltipText);
            else
                this._hide_recent_window_tooltip();
        });
    }

    _show_recent_window_tooltip(item, text) {
        if (!this._recent_windows_tooltip || !text)
            return;

        this._recent_windows_tooltip.set_text(text);
        let [stageX, stageY] = item.actor.get_transformed_position();
        let itemWidth = item.actor.width;
        let tooltipX = stageX + itemWidth + 8;
        let tooltipY = stageY;

        this._recent_windows_tooltip.set_position(tooltipX, tooltipY);
        this._recent_windows_tooltip.show();
    }

    _hide_recent_window_tooltip() {
        this._recent_windows_tooltip?.hide();
    }

    _add_icon_to_menu_item(item, iconSource) {
        let icon = iconSource instanceof Gio.Icon
            ? new St.Icon({
                gicon: iconSource,
                style_class: 'popup-menu-icon',
                icon_size: 16,
            })
            : new St.Icon({
                icon_name: iconSource || 'application-x-executable-symbolic',
                style_class: 'popup-menu-icon',
                icon_size: 16,
            });
        item.insert_child_at_index(icon, 0);
        item.label.x_expand = true;
    }

    _connect_recent_windows_scroll_handler(actor) {
        actor?.connect?.('scroll-event', (_actor, event) => {
            let scrollAdjustment = this._recent_windows_scroll_view?.get_vadjustment?.();
            if (!scrollAdjustment)
                return Clutter.EVENT_PROPAGATE;

            let delta = scrollAdjustment.step_increment || 40;
            let direction = event.get_scroll_direction();
            if (direction === Clutter.ScrollDirection.DOWN ||
                direction === Clutter.ScrollDirection.RIGHT) {
                scrollAdjustment.set_value(Math.min(
                    scrollAdjustment.upper - scrollAdjustment.page_size,
                    scrollAdjustment.get_value() + delta
                ));
                return Clutter.EVENT_STOP;
            }
            if (direction === Clutter.ScrollDirection.UP ||
                direction === Clutter.ScrollDirection.LEFT) {
                scrollAdjustment.set_value(Math.max(
                    scrollAdjustment.lower,
                    scrollAdjustment.get_value() - delta
                ));
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    _format_recent_window_label(snapshot) {
        let title = snapshot.title || snapshot.appName || AppTabMenuStrings.untitledWindow;
        let appName = snapshot.appName ? ` - ${snapshot.appName}` : '';
        let relativeTime = this._format_relative_time(snapshot.timestamp);
        return `${title}${appName} · ${relativeTime}`;
    }

    _format_relative_time(timestamp) {
        let ageMs = Math.max(0, Date.now() - Number(timestamp || Date.now()));
        let minutes = Math.floor(ageMs / 60000);
        if (minutes < 1)
            return AppTabMenuStrings.justNow;
        if (minutes < 60)
            return `${minutes}${AppTabMenuStrings.minuteSuffix}`;

        let hours = Math.floor(minutes / 60);
        if (hours < 24)
            return `${hours}${AppTabMenuStrings.hourSuffix}`;

        return `${Math.floor(hours / 24)}${AppTabMenuStrings.daySuffix}`;
    }

    _get_current_application_windows() {
        if (!this._target_app)
            return [];

        return this._sort_current_windows(this._target_app.get_windows()
            .filter(window => !window.skip_taskbar));
    }

    _get_all_application_windows() {
        return this._sort_current_windows(global.display.list_all_windows()
            .filter(window => !window.skip_taskbar));
    }

    _sort_current_windows(windows) {
        return windows
            .sort((a, b) => {
                if (a.has_focus?.())
                    return -1;
                if (b.has_focus?.())
                    return 1;
                return 0;
            });
    }

    _update_add_tab_visibility(hasWindows) {
        this._tab_controls.set_add_tab_visible(this.show_add_tab_button && hasWindows);
    }

    _on_ellipsize_mode_changed(settings, mode) {
        for (let tab of this._tabs_pool) {
            tab.switch_label_ellipsize_mode(settings.get_boolean(mode));
        }
    }

    on_focus_window_changed(param) {
        this.active_window_tab(param.focus_window);
    }

    /**
     * @param window Meta.Window
     */
    active_window_tab(window) {
        for (let i = 0; i < this._current_tabs_count; i++) {
            this._tabs_pool[i].on_active(window);
        }
        this._tab_controls.refresh_active_state();
    }

    _on_window_created(display, window) {
        let app = this._get_app_for_window(window);
        if (!app || window.skip_taskbar)
            return;

        this._record_recent_window_snapshot(app, window, 'opened');
        this._maybe_restore_pending_window(app, window);
    }

    _get_app_for_window(window) {
        try {
            return Shell.WindowTracker.get_default().get_window_app(window);
        } catch (_e) {
            return null;
        }
    }

    _record_recent_window_snapshot(app, window, section) {
        if (!app || !window || window.skip_taskbar)
            return;

        let pid = window.get_pid?.() ?? 0;
        let baseSnapshot = createWindowSnapshot({
            app,
            window,
            timestamp: Date.now(),
        });
        getProcessLaunchContext(pid).then(({ command, cwd }) => {
            let snapshot = createWindowSnapshot({
                app: null,
                window: null,
                timestamp: baseSnapshot.timestamp,
                command,
                cwd,
            });
            snapshot = {
                ...baseSnapshot,
                command: snapshot.command,
                cwd: snapshot.cwd,
            };
            this._recent_windows_state = recordRecentSnapshot(
                this._recent_windows_state,
                section,
                snapshot
            );
            this._settings.set_string(
                SchemaKeyConstants.RECENT_WINDOWS_STATE,
                serializeRecentWindowsState(this._recent_windows_state)
            );
        }).catch((_e) => {
            this._recent_windows_state = recordRecentSnapshot(
                this._recent_windows_state,
                section,
                baseSnapshot
            );
            this._settings.set_string(
                SchemaKeyConstants.RECENT_WINDOWS_STATE,
                serializeRecentWindowsState(this._recent_windows_state)
            );
        });
    }

    _restore_recent_window_snapshot(snapshot) {
        if (!snapshot)
            return;

        if (snapshot.command?.length && shouldUseCommandForRestore(snapshot.command)) {
            this._pending_restore_snapshots.unshift({
                snapshot,
                expiresAt: Date.now() + 10000,
            });
            this._launch_snapshot_command(snapshot);
            return;
        }

        let shellApp = snapshot.appId
            ? Shell.AppSystem.get_default().lookup_app(snapshot.appId)
            : null;

        if (shellApp) {
            this._pending_restore_snapshots.unshift({
                snapshot,
                expiresAt: Date.now() + 10000,
            });
            if (shellApp.can_open_new_window?.())
                shellApp.open_new_window(snapshot.workspaceIndex ?? -1);
            else
                shellApp.launch(0, snapshot.workspaceIndex ?? -1, Shell.AppLaunchGpu.DEFAULT);
            return;
        }

        if (snapshot.command?.length) {
            try {
                Gio.Subprocess.new(snapshot.command, Gio.SubprocessFlags.NONE);
            } catch (_e) {
            }
        }
    }

    _launch_snapshot_command(snapshot) {
        try {
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.NONE,
            });
            if (snapshot.cwd)
                launcher.set_cwd(snapshot.cwd);
            launcher.spawnv(snapshot.command);
        } catch (_e) {
            let shellApp = snapshot.appId
                ? Shell.AppSystem.get_default().lookup_app(snapshot.appId)
                : null;
            if (shellApp)
                shellApp.launch(0, snapshot.workspaceIndex ?? -1, Shell.AppLaunchGpu.DEFAULT);
        }
    }

    _maybe_restore_pending_window(app, window) {
        if (!this._pending_restore_snapshots?.length)
            return;

        let now = Date.now();
        this._pending_restore_snapshots = this._pending_restore_snapshots
            .filter(item => item.expiresAt > now);
        let index = this._pending_restore_snapshots.findIndex(item =>
            this._snapshot_matches_window(item.snapshot, app, window));
        if (index === -1)
            return;

        let [{ snapshot }] = this._pending_restore_snapshots.splice(index, 1);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._apply_snapshot_to_window(window, snapshot);
            return GLib.SOURCE_REMOVE;
        });
    }

    _snapshot_matches_window(snapshot, app, window) {
        let appId = app?.get_id?.() ?? '';
        let appName = app?.get_name?.() ?? '';
        let wmClass = '';
        try {
            wmClass = window?.get_wm_class?.() ?? '';
        } catch (_e) {
        }

        return Boolean(
            (snapshot.appId && snapshot.appId === appId) ||
            (snapshot.wmClass && snapshot.wmClass === wmClass) ||
            (!snapshot.appId && snapshot.appName && snapshot.appName === appName)
        );
    }

    _apply_snapshot_to_window(window, snapshot) {
        if (!window || !snapshot)
            return;

        try {
            if (snapshot.monitorIndex !== null &&
                snapshot.monitorIndex >= 0 &&
                snapshot.monitorIndex < global.display.get_n_monitors()) {
                window.move_to_monitor(snapshot.monitorIndex);
            }
        } catch (_e) {
        }

        try {
            if (snapshot.workspaceIndex !== null && snapshot.workspaceIndex >= 0) {
                this._create_enough_workspaces(snapshot.workspaceIndex);
                window.change_workspace_by_index(snapshot.workspaceIndex, false);
            }
        } catch (_e) {
        }

        try {
            if (snapshot.state?.isSticky && !window.is_on_all_workspaces())
                window.stick();
            if (snapshot.state?.isAbove && !window.is_above())
                window.make_above();
            if (snapshot.state?.isMaximized && !window.is_maximized())
                window.maximize();
        } catch (_e) {
        }

        try {
            let rect = snapshot.rect;
            if (rect && !snapshot.state?.isMaximized) {
                window.move_frame(true, rect.x, rect.y);
                window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
            }
        } catch (_e) {
        }
    }

    _create_enough_workspaces(workspaceIndex) {
        let workspaceManager = global.workspace_manager;
        while (workspaceManager.n_workspaces <= workspaceIndex) {
            workspaceManager.append_new_workspace(false, global.get_current_time());
            workspaceManager.get_workspace_by_index(workspaceManager.n_workspaces - 1)._keepAliveId = true;
        }
    }

    _init_standalone_display() {
        if (this._floating_bar)
            return;

        let statusArea = Main.panel.statusArea;
        let children = Object.keys(statusArea);
        this._saved_panel_index = children.indexOf('AppTabs');
        if (this._saved_panel_index === -1)
            this._saved_panel_index = this._config.index ?? 10;

        this._hide_panel_status_items();

        this._floating_bar = new FloatingBar({
            tabPanel: this,
            settings: this._settings,
        });
        if (this._tab_panel_container.get_parent())
            this._tab_panel_container.get_parent().remove_child(this._tab_panel_container);
        this._floating_bar.add_child(this._tab_panel_container);
        this._move_display_mode_toggle_to_standalone();
        this._floating_bar.attach();
        this._tab_controls.set_display_mode_icon('standalone');
        this._apply_topbar_visibility(true);

        this.opacity = 0;
        this.hide();
    }

    toggle_display_mode() {
        if (this._switching_display_mode)
            return;

        this._switching_display_mode = true;
        if (this._display_mode === 'panel') {
            this._enter_standalone_mode();
        } else {
            this._enter_panel_mode();
        }
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._switching_display_mode = false;
            return GLib.SOURCE_REMOVE;
        });
    }

    _enter_standalone_mode() {
        if (this._display_mode === 'standalone')
            return;

        this._display_mode = 'standalone';

        let statusArea = Main.panel.statusArea;
        let children = Object.keys(statusArea);
        this._saved_panel_index = children.indexOf('AppTabs');
        if (this._saved_panel_index === -1)
            this._saved_panel_index = this._config.index ?? 10;

        this._hide_panel_status_items();

        if (!this._floating_bar) {
            this._floating_bar = new FloatingBar({
                tabPanel: this,
                settings: this._settings,
            });
        }
        if (this._tab_panel_container.get_parent())
            this._tab_panel_container.get_parent().remove_child(this._tab_panel_container);
        this._floating_bar.add_child(this._tab_panel_container);
        this._move_display_mode_toggle_to_standalone();
        this._floating_bar.attach();
        this._tab_controls.set_display_mode_icon('standalone');
        this._apply_topbar_visibility(true);

        this.remove_transition('opacity');
        this.ease({
            opacity: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._display_mode === 'standalone')
                    this.hide();
            },
        });
    }

    _enter_panel_mode() {
        if (this._display_mode === 'panel')
            return;

        this._display_mode = 'panel';

        this._apply_topbar_visibility(false);

        if (this._floating_bar) {
            let container = this._tab_panel_container;
            if (container.get_parent())
                container.get_parent().remove_child(container);
            this._floating_bar.detach();
            this.add_child(container);
        }

        this._ensure_app_tabs_in_status_area();
        this.attach_panel_display_mode_toggle();
        this._show_panel_status_items();
        this._tab_panel_container.show();
        this._tab_controls.set_display_mode_icon('panel');

        this.remove_transition('opacity');
        this.opacity = 0;
        this.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    attach_panel_display_mode_toggle() {
        if (this._display_mode !== 'panel')
            return;

        this._move_display_mode_toggle_to_panel();
    }

    _move_display_mode_toggle_to_standalone() {
        this._hide_panel_display_mode_toggle();
        let button = this._tab_controls.get_display_mode_toggle_button();
        if (button.get_parent())
            button.get_parent().remove_child(button);
        this._tab_panel_container.add_child(button);
    }

    _move_display_mode_toggle_to_panel() {
        let button = this._tab_controls.get_display_mode_toggle_button();
        if (button.get_parent())
            button.get_parent().remove_child(button);

        if (!this._panel_display_mode_toggle) {
            this._panel_display_mode_toggle = new PanelMenu.Button(1.0, null, true);
            this._panel_display_mode_toggle.add_style_class_name('app-tabs-display-mode-panel-toggle');
        }
        this._panel_display_mode_toggle.add_child(button);
        this._ensure_display_mode_toggle_in_status_area();
        this._panel_display_mode_toggle.show();
    }

    _hide_panel_status_items() {
        this._hide_panel_display_mode_toggle();
        this.container?.hide();
        this.hide();
    }

    _show_panel_status_items() {
        this.container?.show();
        this.show();
        this._panel_display_mode_toggle?.show();
    }

    _ensure_app_tabs_in_status_area() {
        let statusItem = Main.panel.statusArea.AppTabs;
        if (statusItem && statusItem !== this) {
            this._remove_actor_from_parent(statusItem.container);
            statusItem.destroy();
            delete Main.panel.statusArea.AppTabs;
        }

        if (Main.panel.statusArea.AppTabs !== this) {
            if (this._saved_panel_index < 0)
                this._saved_panel_index = this._config.index ?? 10;
            Main.panel.addToStatusArea('AppTabs', this, this._saved_panel_index, this._config.side);
        }
    }

    _ensure_display_mode_toggle_in_status_area() {
        let statusItem = Main.panel.statusArea[DISPLAY_MODE_TOGGLE_ROLE];
        if (statusItem && statusItem !== this._panel_display_mode_toggle) {
            this._remove_actor_from_parent(statusItem.container);
            statusItem.destroy();
            delete Main.panel.statusArea[DISPLAY_MODE_TOGGLE_ROLE];
        }

        if (!this._panel_display_mode_toggle)
            return;

        if (Main.panel.statusArea[DISPLAY_MODE_TOGGLE_ROLE] !== this._panel_display_mode_toggle) {
            Main.panel.addToStatusArea(
                DISPLAY_MODE_TOGGLE_ROLE,
                this._panel_display_mode_toggle,
                this._saved_panel_index + 1,
                this._config.side
            );
        }
    }

    _hide_panel_display_mode_toggle() {
        this._panel_display_mode_toggle?.hide();
    }

    _remove_panel_display_mode_toggle() {
        let statusItem = Main.panel.statusArea[DISPLAY_MODE_TOGGLE_ROLE];
        let button = this._tab_controls?.get_display_mode_toggle_button?.();
        if (button?.get_parent())
            button.get_parent().remove_child(button);

        if (statusItem) {
            this._remove_actor_from_parent(statusItem.container);
            if (statusItem !== this._panel_display_mode_toggle)
                statusItem.destroy();
            delete Main.panel.statusArea[DISPLAY_MODE_TOGGLE_ROLE];
        }
        this._remove_actor_from_parent(this._panel_display_mode_toggle?.container);
        this._panel_display_mode_toggle?.destroy();
        this._panel_display_mode_toggle = null;
    }

    _remove_from_panel_status_area() {
        this._remove_actor_from_parent(this.container);
        let statusItem = Main.panel.statusArea.AppTabs;
        if (statusItem) {
            this._remove_actor_from_parent(statusItem.container);
            if (statusItem !== this)
                statusItem.destroy();
        }
        delete Main.panel.statusArea.AppTabs;
        this._remove_panel_display_mode_toggle();
    }

    _remove_actor_from_parent(actor) {
        if (actor?.get_parent())
            actor.get_parent().remove_child(actor);
    }

    _apply_topbar_visibility(enteringStandalone) {
        if (!enteringStandalone) {
            this._restore_topbar_after_standalone();
            return;
        }

        let shouldHide = this._settings.get_boolean(SchemaKeyConstants.HIDE_TOPBAR_IN_STANDALONE);
        if (shouldHide) {
            this._hide_topbar_for_standalone();
        } else {
            this._restore_topbar_after_standalone();
        }
    }

    _get_topbar_panel_box() {
        return Main.layoutManager.panelBox;
    }

    _get_topbar_height(panelBox) {
        return panelBox?.get_height?.() ?? panelBox?.height ?? this._get_panel_height();
    }

    _get_hidden_topbar_y(panelBox) {
        let anchorY = panelBox?.get_pivot_point?.()?.[1] ?? 0;
        let deltaY = -this._get_topbar_height(panelBox);
        if (anchorY < 0)
            deltaY = -deltaY;
        return this._topbar_base_y + deltaY;
    }

    _prepare_topbar_chrome_for_standalone(panelBox) {
        if (this._topbar_chrome_adjusted)
            return;

        this._topbar_base_y = panelBox.y;
        Main.layoutManager.removeChrome(panelBox);
        Main.layoutManager.addChrome(panelBox, {
            affectsStruts: false,
            trackFullscreen: true,
        });
        this._topbar_chrome_adjusted = true;
    }

    _hide_topbar_for_standalone() {
        let panelBox = this._get_topbar_panel_box();
        if (!panelBox)
            return;

        this._prepare_topbar_chrome_for_standalone(panelBox);
        panelBox.remove_all_transitions?.();
        panelBox.y = this._get_hidden_topbar_y(panelBox);
        panelBox.hide();
        this._topbar_was_hidden = true;
    }

    _show_topbar_temporarily() {
        let panelBox = this._get_topbar_panel_box();
        if (!panelBox)
            return;

        panelBox.remove_all_transitions?.();
        panelBox.show();
        panelBox.y = this._topbar_base_y;
    }

    _restore_topbar_after_standalone() {
        let panelBox = this._get_topbar_panel_box();
        if (!panelBox)
            return;
        if (!this._topbar_chrome_adjusted && !this._topbar_was_hidden)
            return;

        panelBox.remove_all_transitions?.();
        panelBox.show();
        panelBox.y = this._topbar_base_y;
        if (this._topbar_chrome_adjusted) {
            Main.layoutManager.removeChrome(panelBox);
            Main.layoutManager.addChrome(panelBox, {
                affectsStruts: true,
                trackFullscreen: true,
            });
        }
        this._topbar_chrome_adjusted = false;
        this._topbar_was_hidden = false;
    }

    _on_display_mode_setting_changed(settings, key) {
        this._apply_display_mode_for_target_app();
    }

    _on_hide_topbar_setting_changed() {
        if (this._display_mode === 'standalone')
            this._apply_topbar_visibility(true);
    }

    _get_target_app_display_mode() {
        let appId = this._target_app?.get_id?.() ?? '';
        if (standaloneApplicationIncludes(this._standalone_applications, appId))
            return 'standalone';
        if (standaloneApplicationIncludes(this._panel_applications, appId))
            return 'panel';

        return this._settings.get_string(SchemaKeyConstants.DISPLAY_MODE);
    }

    _apply_display_mode_for_target_app() {
        let targetMode = this._get_target_app_display_mode();
        if (targetMode === 'standalone')
            this._enter_standalone_mode();
        else
            this._enter_panel_mode();
    }

    destroy() {
        if (this._init_timeout_id) {
            GLib.Source.remove(this._init_timeout_id);
            this._init_timeout_id = null;
        }
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
        if (this._drag_prepare_stage_release_id) {
            global.stage.disconnect(this._drag_prepare_stage_release_id);
            this._drag_prepare_stage_release_id = null;
        }

        this._tab_controls.clear_drag_placeholder();
        this._drag_placeholder = null;
        this._recent_windows_menu?.destroy();
        this._recent_windows_menu = null;
        this._display_mode_menu?.destroy();
        this._display_mode_menu = null;
        this._fixed_standalone_menu_item = null;
        this._fixed_panel_menu_item = null;
        this._recent_windows_tooltip?.destroy();
        this._recent_windows_tooltip = null;
        this._recent_windows_scroll_view = null;
        this._recent_windows_section = null;
        this._pending_restore_snapshots = null;

        this._scroll_view?.disconnectObject(this);
        this._desktop_settings?.disconnectObject(this);
        this._settings?.disconnectObject(this);
        Main.overview?.disconnectObject(this);
        global.display?.disconnectObject(this);
        global.window_manager?.disconnectObject(this);
        Shell.WindowTracker?.get_default().disconnectObject(this);
        Shell.AppSystem.get_default()?.disconnectObject(this);
        Main.panel?.disconnectObject(this);
        Main.layoutManager?.disconnectObject(this);
        for (let tab of this._tabs_pool) {
            tab.destroy();
        }
        this._tab_controls.destroy();
        this._tab_panel_container.destroy();

        this._menu_manager = null;
        this._scroll_view = null;
        this._tab_panel_container = null;
        this._desktop_settings = null;
        this._settings = null;
        this._tabs_pool = null;
        this._current_tabs_count = null;
        this._target_app = null;
        this._update_windows_later_id = null;
        this._recent_windows_state = null;
        this._standalone_applications = null;
        this._panel_applications = null;
        this._refreshing_display_mode_menu = false;
        this._tab_controls = null;
        if (this._floating_bar) {
            this._floating_bar.detach();
            this._floating_bar.destroy();
            this._floating_bar = null;
        }
        this._restore_topbar_after_standalone();
        this._topbar_chrome_adjusted = false;
        this._topbar_base_y = 0;
        this._remove_from_panel_status_area();
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
            let app_tab = new AppTab({
                style_config: JSON.parse(this._settings.get_string(SchemaKeyConstants.APP_TAB_CONFIG)),
                is_dark_mode: this._is_dark_mode(),
                panel_height: this._get_panel_height(),
                settings: this._settings,
                menu_manager: this._menu_manager,
            });
            app_tab.connect('active-state-changed', () => {
                this._tab_controls.refresh_active_state();
            });
            app_tab.hide();
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
            this._apply_display_mode_for_target_app();
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
            this._update_add_tab_visibility(false);
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
        this._update_add_tab_visibility(windows.length > 0);
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
        this._tab_controls.remove_tab(tab);
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

            tab.connect('close-other-tabs', () => {
                this._close_other_tabs(tab);
            });

            tab.connect('close-tabs-to-the-right', () => {
                this._close_tabs_to_the_right_of(tab);
            });

            // Detect when window is closed
            window.connectObject('unmanaged', () => {
                this._record_recent_window_snapshot(app, window, 'closed');
                let corresponding_tab = this._find_tab_by_window(window);
                if (corresponding_tab) {
                    this._reset_tab(corresponding_tab);
                } else {
                }
            }, this);

            window.connectObject('workspace-changed', () => {
                if (this.only_display_tabs_on_current_workspace) {
                    this._force_update_tabs();
                }
            }, this);

            this._current_tabs_count++;
            this._tab_controls.add_tab(tab);
        });
        this._tab_controls.refresh_active_state();
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
                    this._focus_app_changed();
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

        // 监听 clicked 事件，如果只是点击（没有拖动），则取消拖动准备
        tab.connect('clicked', () => {
            // 如果还没有开始拖动，说明这只是点击，取消拖动准备
            if (this._drag_prepared && this._drag_prepared_tab === tab && !this._dragging_tab) {
                this._cancel_drag_preparation();
            }
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
        this._drag_threshold = 10; // 10px of threshold to prevent accidental drags on click
        this._drag_prepare_stage_release_id = global.stage.connect(
            'button-release-event',
            this._on_prepared_drag_stage_release.bind(this));
    }

    _check_drag_threshold(tab, event) {
        if (!this._drag_prepared) return;

        if (shouldStartPreparedDrag({
            startCoords: this._drag_start_position,
            currentCoords: event.get_coords(),
            threshold: this._drag_threshold,
            eventState: event.get_state(),
            primaryButtonMask: Clutter.ModifierType.BUTTON1_MASK,
        })) {
            this._cancel_drag_preparation();
            this._start_drag(tab);
        }
    }

    _cancel_drag_preparation() {
        if (this._drag_prepare_stage_release_id) {
            global.stage.disconnect(this._drag_prepare_stage_release_id);
            this._drag_prepare_stage_release_id = null;
        }
        this._drag_prepared = false;
        this._drag_prepared_tab = null;
        this._drag_start_position = null;
        this._drag_threshold = null;
    }

    _on_prepared_drag_stage_release() {
        this._cancel_drag_preparation();
        return Clutter.EVENT_PROPAGATE;
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

        this._create_placeholder(tab);
    }

    _create_placeholder(tab) {
        this._drag_placeholder = new St.Widget({
            width: tab.get_width() - 4,
            height: tab.get_height() - 4,
            style_class: 'app-tab-placeholder'
        });

        let tab_index = this._get_tab_index(tab);
        this._tab_controls.begin_drag(tab, this._drag_placeholder, tab_index);

        // Move tab to Main.uiGroup so it can float over everything
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
        this._tab_controls.move_drag_placeholder(target_index);
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
        this._tab_controls.move_tab(tab, target_index);
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
        let target_index = this._tab_controls.get_drag_placeholder_index();

        this._tab_controls.end_drag(tab, target_index);
        this._drag_placeholder = null;

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
        this._tab_controls.move_tab(tab, target_index);
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
        return this._tab_controls.get_tabs();
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

        // Sort by custom order
        let sorted_tabs = visible_tabs.slice().sort((a, b) => {
            let window_a = a.get_current_window();
            let window_b = b.get_current_window();
            let order_a = window_a ? this._windows_order.get(window_a.get_id()) ?? 999999 : 999999;
            let order_b = window_b ? this._windows_order.get(window_b.get_id()) ?? 999999 : 999999;
            return order_a - order_b;
        });

        this._tab_controls.set_tabs(sorted_tabs);
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

    _close_other_tabs(triggerTab) {
        let visible_tabs = this._get_visible_tabs();
        let time = global.get_current_time();
        let toClose = [];
        for (let t of visible_tabs) {
            if (t === triggerTab)
                continue;
            let win = t.get_current_window();
            if (win?.can_close())
                toClose.push(win);
        }
        for (let win of toClose)
            win.delete(time);
    }

    _close_tabs_to_the_right_of(triggerTab) {
        let visible_tabs = this._get_visible_tabs();
        let idx = visible_tabs.indexOf(triggerTab);
        if (idx === -1)
            return;
        let time = global.get_current_time();
        let toClose = [];
        for (let i = idx + 1; i < visible_tabs.length; i++) {
            let win = visible_tabs[i].get_current_window();
            if (win?.can_close())
                toClose.push(win);
        }
        for (let win of toClose)
            win.delete(time);
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
            // Pass
        } catch (error) {
            console.log('Error closing tab:', error);
        }
    }

    _on_window_removed(display, window) {
        this._force_update_tabs();
    }

    _on_window_closed(display, window) {
        this._force_update_tabs();
    }
});
