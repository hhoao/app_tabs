import GLib from 'gi://GLib';
import {
    addOrUpdateStandaloneApplication,
    removeStandaloneApplication,
    restoreStandaloneApplications,
    serializeStandaloneApplications,
    standaloneApplicationIncludes,
} from '../src/utils/StandaloneApplications.js';

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

test('standalone application store restores, deduplicates, and removes records', () => {
    let state = restoreStandaloneApplications('not json');
    assert(Array.isArray(state) && state.length === 0,
        'expected invalid standalone app state to restore to an empty list');

    state = addOrUpdateStandaloneApplication(state, {
        appId: 'code.desktop',
        name: 'Code',
        iconName: 'code',
    });
    state = addOrUpdateStandaloneApplication(state, {
        appId: 'code.desktop',
        name: 'Visual Studio Code',
        iconName: 'vscode',
    });

    assert(state.length === 1, 'expected app records to deduplicate by appId');
    assert(state[0].name === 'Visual Studio Code', 'expected newer app metadata to replace older metadata');
    assert(standaloneApplicationIncludes(state, 'code.desktop'),
        'expected appId lookup to find stored records');

    let roundTrip = restoreStandaloneApplications(serializeStandaloneApplications(state));
    assert(roundTrip[0].iconName === 'vscode', 'expected serialized state to round-trip JSON-safe fields');

    state = removeStandaloneApplication(state, 'code.desktop');
    assert(state.length === 0, 'expected remove by appId to delete stored record');
});

test('schema exposes persistent fixed application display mode records', () => {
    let schema = readSource('./schemas/org.gnome.shell.extensions.app_tabs.gschema.xml');
    let constants = readSource('./src/config/SchemaKeyConstants.js');

    assert(schema.includes('<key name="standalone-applications" type="s">') &&
        schema.includes('<key name="panel-applications" type="s">') &&
        schema.includes('<default>"[]"</default>'),
        'expected schema to persist fixed application display mode records as JSON');
    assert(constants.includes('STANDALONE_APPLICATIONS: "standalone-applications"') &&
        constants.includes('PANEL_APPLICATIONS: "panel-applications"'),
        'expected schema key constants for both fixed application display modes');
});

test('display mode button opens fixed display mode choices on right click', () => {
    let controls = readSource('./src/TabControls.js');
    let panel = readSource('./src/TabPanel.js');
    let strings = readSource('./src/locale/AppTabMenuStrings.js');

    assert(controls.includes('onShowDisplayModeMenu'),
        'expected TabControls to accept a display mode context-menu callback');
    assert(controls.includes("event.get_button() === Clutter.BUTTON_SECONDARY") &&
        controls.includes('this._on_show_display_mode_menu?.()'),
        'expected display mode button right click to open its menu');
    assert(panel.includes('onShowDisplayModeMenu: this._toggle_display_mode_menu.bind(this)'),
        'expected TabPanel to wire the display mode menu callback');
    assert(panel.includes('_init_display_mode_menu()') &&
        panel.includes('PopupMenu.PopupSwitchMenuItem') &&
        panel.includes('AppTabMenuStrings.fixedStandaloneForCurrentApplication') &&
        panel.includes('AppTabMenuStrings.fixedPanelForCurrentApplication'),
        'expected TabPanel to own switch menu items for both fixed current-app modes');
    assert(panel.includes("_set_target_app_fixed_display_mode('standalone', state)") &&
        panel.includes("_set_target_app_fixed_display_mode('panel', state)"),
        'expected menu switches to write either fixed standalone or fixed panel mode');
    assert(strings.includes('fixedStandaloneForCurrentApplication') &&
        strings.includes('Fixed standalone mode') &&
        strings.includes('fixedPanelForCurrentApplication') &&
        strings.includes('Fixed panel mode'),
        'expected translatable menu labels for both fixed display modes');
});

test('left click is temporary and fixed app modes override the default display mode', () => {
    let panel = readSource('./src/TabPanel.js');

    let toggleStart = panel.indexOf('toggle_display_mode()');
    let toggleEnd = panel.indexOf('\n    _enter_standalone_mode()', toggleStart);
    let toggleBody = panel.slice(toggleStart, toggleEnd);
    assert(toggleBody.includes('this._enter_standalone_mode();') &&
        toggleBody.includes('this._enter_panel_mode();') &&
        !panel.includes('this._settings.set_string(SchemaKeyConstants.DISPLAY_MODE'),
        'expected left-click mode switching to be temporary and not write display-mode');
    assert(panel.includes('_get_target_app_display_mode()') &&
        panel.includes('standaloneApplicationIncludes(this._standalone_applications, appId)') &&
        panel.includes('standaloneApplicationIncludes(this._panel_applications, appId)') &&
        panel.includes('this._settings.get_string(SchemaKeyConstants.DISPLAY_MODE)'),
        'expected display mode resolution to prefer fixed app records before the default display mode');
    assert(panel.includes('_apply_display_mode_for_target_app()') &&
        panel.includes("targetMode === 'standalone'") &&
        panel.includes('this._enter_panel_mode();'),
        'expected focus/default changes to apply the resolved display mode');
    assert(panel.includes('_on_display_mode_setting_changed') &&
        panel.includes('_apply_display_mode_for_target_app'),
        'expected prefs default display-mode changes to affect non-fixed applications');
});

test('preferences show fixed standalone and fixed panel applications and can remove them', () => {
    let prefs = readSource('./prefs.js');
    let strings = readSource('./src/locale/PrefsStrings.js');

    assert(prefs.includes('get_application_display_mode_group(') &&
        prefs.includes('SchemaKeyConstants.STANDALONE_APPLICATIONS') &&
        prefs.includes('SchemaKeyConstants.PANEL_APPLICATIONS'),
        'expected preferences to render fixed standalone and fixed panel application groups');
    assert(prefs.includes('create_application_display_mode_row') &&
        prefs.includes("icon_name: 'user-trash-symbolic'") &&
        prefs.includes('removeStandaloneApplication'),
        'expected each fixed application row to have a delete button that updates settings');
    assert(prefs.includes("settings.connect('changed::' + keyName, refresh);"),
        'expected preferences lists to refresh when fixed application records change');
    assert(strings.includes('fixedStandaloneApplications') &&
        strings.includes('Fixed standalone applications') &&
        strings.includes('fixedPanelApplications') &&
        strings.includes('Fixed panel applications'),
        'expected localized titles for both fixed application preference groups');
});
