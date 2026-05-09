import GLib from 'gi://GLib';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function test(name, fn) {
    try {
        fn();
        print(`PASS ${name}`);
    } catch (error) {
        printerr(`FAIL ${name}: ${error.message}`);
        throw error;
    }
}

function readSource(path) {
    let [, bytes] = GLib.file_get_contents(path);
    return new TextDecoder().decode(bytes);
}

test('schema exposes persistent recent window snapshots', () => {
    let schema = readSource('./schemas/org.gnome.shell.extensions.app_tabs.gschema.xml');
    let constants = readSource('./src/config/SchemaKeyConstants.js');

    assert(schema.includes('<key name="recent-windows-state" type="s">'),
        'expected schema to store recent window state');
    assert(constants.includes('RECENT_WINDOWS_STATE: "recent-windows-state"'),
        'expected schema key constant for recent window state');
});

test('recent-window menu visibility can be disabled from preferences', () => {
    let schema = readSource('./schemas/org.gnome.shell.extensions.app_tabs.gschema.xml');
    let constants = readSource('./src/config/SchemaKeyConstants.js');
    let prefs = readSource('./prefs.js');
    let tabPanel = readSource('./src/TabPanel.js');
    let prefsStrings = readSource('./src/locale/PrefsStrings.js');

    assert(schema.includes('<key name="show-recent-windows-menu" type="b">') &&
        schema.includes('<default>true</default>'),
        'expected schema to expose a default-on recent window menu setting');
    assert(constants.includes('SHOW_RECENT_WINDOWS_MENU: "show-recent-windows-menu"'),
        'expected schema key constant for recent window menu visibility');
    assert(prefs.includes('get_show_recent_windows_menu_row') &&
        prefs.includes('SchemaKeyConstants.SHOW_RECENT_WINDOWS_MENU'),
        'expected preferences to bind a switch for recent window menu visibility');
    assert(prefsStrings.includes('showRecentWindowsMenu'),
        'expected localized label for recent window menu visibility');
    assert(tabPanel.includes('this.show_recent_windows_menu =') &&
        tabPanel.includes('_on_show_recent_windows_menu_changed') &&
        tabPanel.includes('this._tab_controls.set_recent_windows_visible(this.show_recent_windows_menu)'),
        'expected TabPanel to apply and listen to recent window menu visibility');
});

test('TabControls provides a global recent-window menu button on the left of tabs', () => {
    let controls = readSource('./src/TabControls.js');
    let panel = readSource('./src/TabPanel.js');

    assert(controls.includes('onShowRecentWindows'),
        'expected TabControls to accept a recent-window callback');
    assert(controls.includes('_recent_windows_button'),
        'expected TabControls to own a recent-window button');
    assert(controls.includes("icon_name: 'pan-down-symbolic'"),
        'expected recent-window button to use a Chrome-like down arrow icon');
    assert(controls.includes('get_recent_windows_button()') &&
        controls.includes('get_recent_windows_divider()'),
        'expected TabControls to expose recent-window controls');
    assert(panel.includes('onShowRecentWindows: this._toggle_recent_windows_menu.bind(this)'),
        'expected TabPanel to wire the recent-window button callback');
    let recentButtonIndex = panel.indexOf('this._tab_panel_container.add_child(this._tab_controls.get_recent_windows_button());');
    let scrollViewIndex = panel.indexOf('this._tab_panel_container.add_child(this._scroll_view);');
    assert(recentButtonIndex !== -1 && scrollViewIndex !== -1 && recentButtonIndex < scrollViewIndex,
        'expected recent-window button to be placed before the scroll view');
    assert(panel.includes('this._tab_controls.set_recent_windows_visible(this.show_recent_windows_menu);'),
        'expected recent-window button visibility to follow its preference');
});

test('TabPanel records global opened and closed window snapshots and can restore them from command lines', () => {
    let panel = readSource('./src/TabPanel.js');

    assert(panel.includes('createWindowSnapshot') &&
        panel.includes('recordRecentSnapshot') &&
        panel.includes('getProcessLaunchContext') &&
        panel.includes('serializeRecentWindowsState') &&
        panel.includes('restoreRecentWindowsState'),
        'expected TabPanel to use the recent window store helpers');
    assert(panel.includes('_record_recent_window_snapshot') &&
        panel.includes("'opened'") &&
        panel.includes("'closed'"),
        'expected TabPanel to record opened and closed snapshots');
    assert(panel.includes("global.display.connectObject('window-created'"),
        'expected TabPanel to listen for newly-created windows');
    assert(panel.includes("window.connectObject('unmanaged'") &&
        panel.includes("this._record_recent_window_snapshot(app, window, 'closed')"),
        'expected TabPanel to record a closed snapshot before clearing a tab');
    assert(panel.includes('_restore_recent_window_snapshot(snapshot)') &&
        panel.includes('snapshot.command?.length') &&
        panel.includes('_launch_snapshot_command(snapshot)') &&
        panel.includes('shellApp.launch('),
        'expected TabPanel to prefer command restore and fall back to Shell.App launch');
    assert(panel.includes('this._recent_windows_state.closed') &&
        !panel.includes('_filter_snapshots_for_target_app('),
        'expected recent history to be global instead of filtered by the focused application');
});

test('recent-window menu is compact with icon submenus, hidden scrollbar, and no opened section', () => {
    let panel = readSource('./src/TabPanel.js');
    let strings = readSource('./src/locale/AppTabMenuStrings.js');
    let recentScrollViewStart = panel.indexOf('this._recent_windows_scroll_view = new St.ScrollView({');
    let recentScrollViewEnd = panel.indexOf('});', recentScrollViewStart);
    let recentScrollViewConfig = panel.slice(recentScrollViewStart, recentScrollViewEnd);

    assert(recentScrollViewStart !== -1 &&
        panel.includes('max-height: 520px') &&
        recentScrollViewConfig.includes('vscrollbar_policy: St.PolicyType.NEVER'),
        'expected recent-window menu contents to be capped while hiding the vertical scrollbar');
    assert(panel.includes('PopupMenu.PopupSubMenuMenuItem'),
        'expected current and closed windows to be expandable submenus');
    assert(panel.includes('_add_icon_menu_item') &&
        panel.includes('St.Icon') &&
        panel.includes('item.insert_child_at_index(icon, 0)'),
        'expected every actionable menu row to include an icon');
    assert(panel.includes('item.icon ?? item.iconName ?? iconName'),
        'expected recently closed child rows to use the captured app icon name before falling back');
    assert(panel.includes('RECENT_CLOSED_DISPLAY_LIMIT') &&
        panel.includes('this._recent_windows_state.closed.slice(0, RECENT_CLOSED_DISPLAY_LIMIT)'),
        'expected recently closed windows to have a display limit');
    assert(!panel.includes('AppTabMenuStrings.recentlyOpenedWindows'),
        'expected recently opened windows section to be removed from the menu');
    assert(!strings.includes('recentlyOpenedWindows'),
        'expected opened-window menu text to be removed');
});

test('recent-window menu separates current app windows from all app windows', () => {
    let panel = readSource('./src/TabPanel.js');
    let strings = readSource('./src/locale/AppTabMenuStrings.js');

    assert(strings.includes('currentApplicationWindows') &&
        strings.includes('Current application windows'),
        'expected label for current application windows');
    assert(strings.includes('currentAllApplicationsWindows') &&
        strings.includes('Current all applications windows'),
        'expected label for current all applications windows');
    assert(panel.includes('_get_current_application_windows()') &&
        panel.includes('_get_all_application_windows()'),
        'expected separate window providers for current app and all apps');
    assert(panel.includes('AppTabMenuStrings.currentApplicationWindows') &&
        panel.includes('AppTabMenuStrings.currentAllApplicationsWindows'),
        'expected both current-window submenus to be rendered');
    assert(panel.includes('this._target_app.get_windows()') &&
        panel.includes('global.display.list_all_windows()'),
        'expected current app list to use target app and all app list to use global windows');
});

test('recent-window submenus default open, keep parent rows plain, and scroll from child rows', () => {
    let panel = readSource('./src/TabPanel.js');

    assert(panel.includes('submenu.setSubmenuShown?.(true)') ||
        panel.includes('submenu.menu.open(false)'),
        'expected recent-window submenus to be expanded by default');
    assert(!panel.includes('this._add_icon_to_menu_item(submenu'),
        'expected parent submenu rows not to receive icons');
    assert(panel.includes('item.insert_child_at_index(icon, 0)'),
        'expected child row icons to be inserted on the left');
    assert(panel.includes('_connect_recent_windows_scroll_handler') &&
        panel.includes("actor?.connect?.('scroll-event'") &&
        panel.includes('scrollAdjustment.set_value'),
        'expected scroll events on hovered child rows to move the scroll view');
});

test('recent-window child labels are truncated and full details appear in a tooltip', () => {
    let panel = readSource('./src/TabPanel.js');

    assert(panel.includes('RECENT_WINDOW_LABEL_MAX_LENGTH'),
        'expected a fixed max length for visible child labels');
    assert(panel.includes('_truncate_recent_window_label(label)') &&
        panel.includes('label.slice(0, RECENT_WINDOW_LABEL_MAX_LENGTH - 1)'),
        'expected visible child labels to be truncated');
    assert(panel.includes('_init_recent_windows_tooltip') &&
        panel.includes('_show_recent_window_tooltip') &&
        panel.includes('_hide_recent_window_tooltip'),
        'expected tooltip lifecycle helpers for full details');
    assert(panel.includes("item.connect('notify::hover'") &&
        panel.includes('this._show_recent_window_tooltip(item, tooltipText)') &&
        panel.includes('this._hide_recent_window_tooltip()'),
        'expected menu item hover to show and hide the full-detail tooltip');
    assert(panel.includes('this._recent_windows_tooltip.set_text(text)') &&
        panel.includes('Main.uiGroup.add_child(this._recent_windows_tooltip)'),
        'expected tooltip actor to be a shell overlay label');
});
