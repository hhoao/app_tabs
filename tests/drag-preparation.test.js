import {
    getDragDistance,
    shouldStartPreparedDrag,
} from '../src/utils/DragPreparation.js';

const PRIMARY_BUTTON_MASK = 1 << 8;

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

test('getDragDistance returns euclidean distance', () => {
    assert(getDragDistance([0, 0], [6, 8]) === 10, 'expected distance to be 10');
});

test('prepared drag does not start when primary button is no longer pressed', () => {
    assert(shouldStartPreparedDrag({
        startCoords: [10, 10],
        currentCoords: [30, 10],
        threshold: 10,
        eventState: 0,
        primaryButtonMask: PRIMARY_BUTTON_MASK,
    }) === false, 'drag should not start without primary button pressed');
});

test('prepared drag starts after threshold while primary button is pressed', () => {
    assert(shouldStartPreparedDrag({
        startCoords: [10, 10],
        currentCoords: [30, 10],
        threshold: 10,
        eventState: PRIMARY_BUTTON_MASK,
        primaryButtonMask: PRIMARY_BUTTON_MASK,
    }) === true, 'drag should start once threshold is exceeded with primary button pressed');
});

import GLib from 'gi://GLib';

test('TabPanel source guards prepared drag with primary button state', () => {
    let [, bytes] = GLib.file_get_contents('./src/TabPanel.js');
    let source = new TextDecoder().decode(bytes);
    assert(source.includes('shouldStartPreparedDrag({'),
        'expected TabPanel to use shouldStartPreparedDrag when checking drag threshold');
    assert(source.includes('Clutter.ModifierType.BUTTON1_MASK'),
        'expected TabPanel to require the primary button mask before starting drag');
});

test('TabPanel source cancels prepared drag on global release outside the tab', () => {
    let [, bytes] = GLib.file_get_contents('./src/TabPanel.js');
    let source = new TextDecoder().decode(bytes);
    assert(source.includes('_drag_prepare_stage_release_id'),
        'expected a dedicated stage release handler for prepared drag state');
    assert(source.includes("_on_prepared_drag_stage_release"),
        'expected a stage release callback that cancels prepared drag');
});

test('AppTab source notifies TabPanel when local active state changes', () => {
    let [, appTabBytes] = GLib.file_get_contents('./src/AppTab.js');
    let [, tabPanelBytes] = GLib.file_get_contents('./src/TabPanel.js');
    let appTabSource = new TextDecoder().decode(appTabBytes);
    let tabPanelSource = new TextDecoder().decode(tabPanelBytes);

    assert(appTabSource.includes("'active-state-changed'"),
        'expected AppTab to expose an active-state-changed signal');
    assert(tabPanelSource.includes("'active-state-changed'"),
        'expected TabPanel to refresh divider visibility after local active changes');
});

test('divider visibility follows AppTab active state instead of window focus query', () => {
    let [, bytes] = GLib.file_get_contents('./src/AppTab.js');
    let source = new TextDecoder().decode(bytes);

    assert(source.includes('return this._is_active;'),
        'expected divider state to follow the same active state used by tab styling');
    assert(!source.includes('has_focus() ?? false'),
        'divider visibility should not depend on Meta.Window.has_focus() timing');
});

test('TabControls owns divider pool instead of AppTab or TabPanel', () => {
    let [, appTabBytes] = GLib.file_get_contents('./src/AppTab.js');
    let [, tabPanelBytes] = GLib.file_get_contents('./src/TabPanel.js');
    let [, tabControlsBytes] = GLib.file_get_contents('./src/TabControls.js');
    let appTabSource = new TextDecoder().decode(appTabBytes);
    let tabPanelSource = new TextDecoder().decode(tabPanelBytes);
    let tabControlsSource = new TextDecoder().decode(tabControlsBytes);

    assert(tabControlsSource.includes('_tab_divider_pool'),
        'expected TabControls to maintain the divider pool');
    assert(!appTabSource.includes('get_divide()') && !appTabSource.includes('set_divide('),
        'expected AppTab not to own divider actors');
    assert(!tabPanelSource.includes('_tab_divider_pool') &&
        !tabPanelSource.includes('buildDividerStyle') &&
        !tabPanelSource.includes('getDividerVisibility'),
        'expected TabPanel not to own divider layout details');
    assert(tabPanelSource.includes('this._tab_controls.'),
        'expected TabPanel to use TabControls tab-facing APIs');
});
