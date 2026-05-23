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

test('FloatingBar uses monitor geometry instead of primary monitor index for positioning', () => {
    let source = readSource('./src/FloatingBar.js');

    assert(source.includes('_get_primary_monitor_geometry()'),
        'expected FloatingBar to centralize primary monitor geometry lookup');
    assert(source.includes('Main.layoutManager.primaryMonitor') ||
        source.includes('global.display.get_monitor_geometry'),
        'expected FloatingBar to use monitor geometry with width and height');
    assert(!source.includes('let monitor = global.display.get_primary_monitor();'),
        'expected FloatingBar not to treat primary monitor index as geometry');
});

test('FloatingBar recenters default position after allocation changes', () => {
    let source = readSource('./src/FloatingBar.js');

    assert(source.includes('const DEFAULT_POSITION'),
        'expected FloatingBar to use a named default position sentinel');
    assert(source.includes('_using_default_position'),
        'expected FloatingBar to track whether position is still automatic');
    assert(source.includes("this.connect('notify::allocation'") &&
        source.includes('_queue_position_update()'),
        'expected FloatingBar to reposition after real allocation is known');
    assert(source.includes('_get_centered_position()') &&
        source.includes('this.width'),
        'expected FloatingBar to center using actual allocated width');
    assert(source.includes('if (!this._using_default_position)') &&
        source.includes('_clamp_position'),
        'expected manual positions to clamp instead of recentering');
});

test('FloatingBar provides a dedicated drag handle for manual positioning', () => {
    let source = readSource('./src/FloatingBar.js');

    assert(source.includes('_create_drag_handle()'),
        'expected FloatingBar to create a dedicated drag handle');
    assert(source.includes('app-tabs-floating-drag-handle'),
        'expected drag handle to have a dedicated style class');
    assert(source.includes("this._drag_handle.connect('button-press-event'") &&
        source.includes('this._begin_drag(event);'),
        'expected drag handle presses to start FloatingBar drag');
    assert(source.includes('this._using_default_position = false;'),
        'expected manual drag to switch FloatingBar out of automatic centering');
});

test('TabPanel keeps statusArea registration across display mode switches', () => {
    let source = readSource('./src/TabPanel.js');

    assert(source.includes('_hide_panel_status_items()') &&
        source.includes('_ensure_app_tabs_in_status_area()'),
        'expected mode switches to hide/show panel items instead of unregistering');
    assert(source.includes('_enter_standalone_mode()') &&
        source.includes('this._hide_panel_status_items();'),
        'expected standalone entry to hide panel status items');
    assert(source.includes('_enter_panel_mode()') &&
        source.includes('this._ensure_app_tabs_in_status_area();'),
        'expected panel entry to register only when missing');
    assert(!source.includes('this._remove_from_panel_status_area();\n        Main.panel.addToStatusArea'),
        'expected panel restoration not to tear down and re-add on every switch');
});

test('TabPanel clears stale AppTabs statusArea entries from previous instances', () => {
    let source = readSource('./src/TabPanel.js');

    assert(source.includes('let statusItem = Main.panel.statusArea.AppTabs;'),
        'expected TabPanel to inspect the current AppTabs statusArea entry');
    assert(source.includes('if (statusItem !== this)') &&
        source.includes('statusItem.destroy();'),
        'expected TabPanel to destroy stale AppTabs entries owned by previous instances');
    assert(source.includes('delete Main.panel.statusArea.AppTabs'),
        'expected TabPanel to clear the AppTabs statusArea slot unconditionally before re-adding');
});

test('TabPanel removes stale panel wrappers only during registration cleanup', () => {
    let source = readSource('./src/TabPanel.js');

    assert(source.includes('_remove_actor_from_parent(actor)'),
        'expected TabPanel to centralize actor parent removal');
    assert(!source.includes('this._remove_actor_from_parent(this);'),
        'expected TabPanel not to remove itself from its own PanelMenu container');
    assert(source.includes('this._remove_actor_from_parent(statusItem.container);'),
        'expected stale AppTabs cleanup to remove the wrapper container');
    assert(source.includes('_show_panel_status_items()') &&
        source.includes('this.container?.show();'),
        'expected panel restore to show the PanelMenu wrapper container');
});

test('panel mode keeps the display mode toggle outside the original tabs container', () => {
    let source = readSource('./src/TabPanel.js');
    let extensionSource = readSource('./extension.js');

    assert(!source.includes('this._tab_panel_container.add_child(this._tab_controls.get_display_mode_toggle_button());'),
        'expected constructor not to add display mode toggle directly to the tabs container');
    assert(source.includes('_move_display_mode_toggle_to_standalone()'),
        'expected standalone mode to move the toggle into the floating tabs container');
    assert(source.includes('attach_panel_display_mode_toggle()'),
        'expected panel mode to expose a separate panel toggle attachment');
    assert(extensionSource.includes('this._tabs.attach_panel_display_mode_toggle();'),
        'expected extension enable to attach the separate toggle in panel mode');
});

test('standalone topbar hiding moves panelBox without toggling panel visibility', () => {
    let source = readSource('./src/TabPanel.js');
    let visibilityStart = source.indexOf('_apply_topbar_visibility(enteringStandalone)');
    let visibilityEnd = source.indexOf('_on_display_mode_setting_changed', visibilityStart);
    let visibilitySource = source.slice(visibilityStart, visibilityEnd);

    assert(source.includes('_hide_topbar_for_standalone()') &&
        source.includes('_restore_topbar_after_standalone()'),
        'expected standalone topbar visibility to use dedicated panelBox helpers');
    assert(source.includes('Main.layoutManager.panelBox'),
        'expected standalone topbar hiding to manipulate layoutManager.panelBox');
    assert(source.includes('affectsStruts: false'),
        'expected hidden standalone topbar not to reserve workspace struts');
    assert(!visibilitySource.includes('Main.panel.hide()') &&
        !visibilitySource.includes('Main.panel.show()'),
        'expected topbar visibility changes not to hide or show Main.panel directly');
});

test('standalone topbar restore is a no-op until this extension hid it', () => {
    let source = readSource('./src/TabPanel.js');
    let restoreStart = source.indexOf('_restore_topbar_after_standalone()');
    let restoreEnd = source.indexOf('_on_display_mode_setting_changed', restoreStart);
    let restoreSource = source.slice(restoreStart, restoreEnd);

    assert(restoreSource.includes('!this._topbar_chrome_adjusted') &&
        restoreSource.includes('!this._topbar_was_hidden') &&
        restoreSource.includes('return;'),
        'expected topbar restore not to move panelBox before standalone hiding owned it');
});
