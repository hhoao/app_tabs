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

test('schema defines display mode transition settings', () => {
    let schema = readSource('./schemas/org.gnome.shell.extensions.app_tabs.gschema.xml');
    let constants = readSource('./src/config/SchemaKeyConstants.js');

    assert(schema.includes('<key name="enable-display-mode-transition" type="b">') &&
        schema.includes('<key name="display-mode-transition-duration" type="i">'),
        'expected gschema keys for transition toggle and duration');
    assert(constants.includes('ENABLE_DISPLAY_MODE_TRANSITION') &&
        constants.includes('DISPLAY_MODE_TRANSITION_DURATION'),
        'expected schema key constants for display mode transitions');
});

test('display mode transitions read settings through shared helper', () => {
    let helper = readSource('./src/utils/DisplayModeTransition.js');
    let tabPanel = readSource('./src/TabPanel.js');
    let floatingBar = readSource('./src/FloatingBar.js');
    let prefs = readSource('./prefs.js');

    assert(helper.includes('getDisplayModeTransitionDuration') &&
        helper.includes('applyOpacityTransition') &&
        helper.includes('applyPanelBoxYTransition'),
        'expected shared transition helper');
    assert(tabPanel.includes("applyOpacityTransition(this, 0, this._settings") &&
        tabPanel.includes("applyOpacityTransition(this, 255, this._settings"),
        'expected TabPanel to use shared opacity transitions');
    assert(floatingBar.includes('applyOpacityTransition(this, 255, this._settings)') &&
        floatingBar.includes('applyOpacityTransition(this, 0, this._settings') &&
        floatingBar.includes('detach(onComplete = null)') &&
        floatingBar.includes('detachImmediate()'),
        'expected FloatingBar attach and detach to use shared opacity transitions');
    assert(tabPanel.includes('this._reparent_tab_panel_container_to_panel();') &&
        tabPanel.includes('this._floating_bar.detach()') &&
        tabPanel.includes('this._finalize_panel_mode_entry();'),
        'expected panel mode to reparent tabs and finalize immediately while floating bar fades out');
    assert(prefs.includes('get_display_mode_transition_rows') &&
        prefs.includes('SchemaKeyConstants.ENABLE_DISPLAY_MODE_TRANSITION') &&
        prefs.includes('SchemaKeyConstants.DISPLAY_MODE_TRANSITION_DURATION'),
        'expected preferences UI for transition settings');
});
