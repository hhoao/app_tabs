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

test('TabControls renders a trailing add-tab button wired to its callback', () => {
    let source = readSource('./src/TabControls.js');

    assert(source.includes('onAddTab'),
        'expected TabControls constructor to accept an add-tab callback');
    assert(source.includes('_add_tab_button'),
        'expected TabControls to own a trailing add-tab button');
    assert(source.includes('app-tabs-add-button'),
        'expected add-tab button to have a dedicated style class');
    assert(source.includes("icon_name: 'list-add-symbolic'"),
        'expected add-tab button to use the GNOME add icon');
    assert(source.includes(".connect('clicked'") && source.includes('this._on_add_tab?.()'),
        'expected add-tab button clicks to invoke the callback');
    assert(source.includes(".connect('notify::hover'") &&
        source.includes('buildAddButtonStyle'),
        'expected add-tab button hover to use adaptive theme styling');
});

test('TabPanel asks the current application to open a new window from the add button', () => {
    let source = readSource('./src/TabPanel.js');

    assert(source.includes('onAddTab: this._open_new_tab_for_target_app.bind(this)'),
        'expected TabPanel to pass the add-tab callback into TabControls');
    assert(source.includes('_open_new_tab_for_target_app()'),
        'expected TabPanel to own current-app tab creation logic');
    assert(source.includes('this._target_app?.can_open_new_window?.()'),
        'expected TabPanel to guard against apps that cannot open new windows');
    assert(source.includes('this._target_app.open_new_window(-1)'),
        'expected TabPanel to open a new window for the current application');
});

test('TabControls treats the trailing add button as an inactive tab for dividers', () => {
    let source = readSource('./src/TabControls.js');

    assert(source.includes('...this._tabs.map(tab => tab.is_focused()),') &&
        source.includes('false,'),
        'expected add button to participate in divider visibility as inactive');
    assert(source.includes('_add_tab_divider'),
        'expected TabControls to own a dedicated divider before the add button');
    assert(!source.includes('this.actor.add_child(this._add_tab_button);'),
        'expected add button to stay outside the scrollable tab actor');
});

test('TabPanel places the add button outside the scroll view on the right', () => {
    let source = readSource('./src/TabPanel.js');

    assert(source.includes('_tab_panel_container'),
        'expected TabPanel to create a horizontal container for scroll view and add button');
    assert(source.includes('this._scroll_view.add_child(this._tab_controls.actor);'),
        'expected only tabs to be placed inside the scroll view');
    assert(source.includes('this._tab_panel_container.add_child(this._scroll_view);') &&
        source.includes('this._tab_panel_container.add_child(this._tab_controls.get_add_tab_divider());') &&
        source.includes('this._tab_panel_container.add_child(this._tab_controls.get_add_tab_button());'),
        'expected add button and its divider to be added beside the scroll view');
});

test('TabControls can hide the add button and its divider together', () => {
    let source = readSource('./src/TabControls.js');

    assert(source.includes('set_add_tab_visible(isVisible)'),
        'expected TabControls to expose add button visibility control');
    assert(source.includes('this._add_tab_button.show()') &&
        source.includes('this._add_tab_button.hide()'),
        'expected add button visibility control to show and hide the button');
    assert(source.includes('this._is_add_tab_visible'),
        'expected divider visibility to know whether the add button is visible');
});

test('TabPanel hides the add button only when there are no retained windows', () => {
    let source = readSource('./src/TabPanel.js');

    assert(source.includes('this._update_add_tab_visibility(false);') &&
        source.includes('if (!app)'),
        'expected add button to hide when there is no retained target application');
    assert(source.includes('windows.length > 0'),
        'expected add button visibility to depend on visible windows');
    assert(!source.includes('windows.length > 0 && app.can_open_new_window?.()'),
        'expected add button visibility not to depend on can_open_new_window timing');
    assert(source.includes('targetApp !== null && this._target_app !== targetApp'),
        'expected sync to keep previous app tabs when no application is focused');
});

test('add button visibility can be disabled from preferences', () => {
    let schema = readSource('./schemas/org.gnome.shell.extensions.app_tabs.gschema.xml');
    let constants = readSource('./src/config/SchemaKeyConstants.js');
    let prefs = readSource('./prefs.js');
    let tabPanel = readSource('./src/TabPanel.js');
    let prefsStrings = readSource('./src/locale/PrefsStrings.js');

    assert(schema.includes('<key name="show-add-tab-button" type="b">') &&
        schema.includes('<default>true</default>'),
        'expected schema to expose a default-on add button setting');
    assert(constants.includes('SHOW_ADD_TAB_BUTTON: "show-add-tab-button"'),
        'expected schema key constant for add button visibility');
    assert(prefs.includes('get_show_add_tab_button_row') &&
        prefs.includes('SchemaKeyConstants.SHOW_ADD_TAB_BUTTON'),
        'expected preferences to bind a switch for add button visibility');
    assert(prefsStrings.includes('showAddTabButton'),
        'expected localized label for add button visibility');
    assert(tabPanel.includes('this.show_add_tab_button =') &&
        tabPanel.includes('_on_show_add_tab_button_changed') &&
        tabPanel.includes('_update_add_tab_visibility(windows.length > 0)'),
        'expected TabPanel to combine preference state with window availability');
});
