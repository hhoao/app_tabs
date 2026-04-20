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
