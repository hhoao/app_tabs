import {
    getDividerVisibility,
} from '../src/utils/DividerVisibility.js';

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

test('divider shows only between adjacent inactive tabs', () => {
    let visibility = getDividerVisibility([false, true, false, false]);

    assert(visibility.length === 5, 'visibility should include one more divider than tabs');
    assert(visibility[0] === false, 'outer leading divider should stay hidden');
    assert(visibility[1] === false, 'divider touching an active tab should hide');
    assert(visibility[2] === false, 'divider after active tab should hide');
    assert(visibility[3] === true, 'inactive tabs should keep their separator');
    assert(visibility[4] === false, 'outer trailing divider should stay hidden');
});

test('divider hides on both sides of first and last active tabs', () => {
    let firstActive = getDividerVisibility([true, false, false]);
    let lastActive = getDividerVisibility([false, false, true]);

    assert(firstActive.join(',') === 'false,false,true,false',
        'first active tab should hide the separator to its right');
    assert(lastActive.join(',') === 'false,true,false,false',
        'last active tab should hide the separator to its left');
});

test('empty tab list still has one hidden divider boundary', () => {
    let visibility = getDividerVisibility([]);

    assert(visibility.length === 1, 'empty tab pool should still expose one boundary');
    assert(visibility[0] === false, 'empty boundary should stay hidden');
});
