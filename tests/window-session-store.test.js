import {
    RECENT_WINDOW_LIMIT,
    createWindowSnapshot,
    recordRecentSnapshot,
    restoreRecentWindowsState,
    serializeRecentWindowsState,
} from '../src/utils/WindowSessionStore.js';

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

function fakeWorkspace(index) {
    return { index: () => index };
}

function fakeWindow(overrides = {}) {
    return {
        get_id: () => 77,
        get_description: () => '0x4d',
        get_title: () => 'Project notes',
        get_pid: () => 1234,
        get_wm_class: () => 'Code',
        get_wm_class_instance: () => 'code',
        get_workspace: () => fakeWorkspace(2),
        get_monitor: () => 1,
        is_on_primary_monitor: () => false,
        get_frame_rect: () => ({ x: 10, y: 20, width: 800, height: 600 }),
        is_fullscreen: () => false,
        minimized: false,
        is_above: () => true,
        is_on_all_workspaces: () => false,
        is_maximized: () => false,
        ...overrides,
    };
}

function fakeApp(overrides = {}) {
    return {
        get_id: () => 'code.desktop',
        get_name: () => 'Code',
        get_icon: () => ({ to_string: () => 'code' }),
        get_app_info: () => ({
            get_filename: () => '/usr/share/applications/code.desktop',
        }),
        ...overrides,
    };
}

test('createWindowSnapshot captures restorable shell-level window state', () => {
    let snapshot = createWindowSnapshot({
        app: fakeApp(),
        window: fakeWindow(),
        timestamp: 1700000000000,
        command: ['code', '--reuse-window'],
        cwd: '/home/me/project',
    });

    assert(snapshot.appId === 'code.desktop', 'expected desktop app id');
    assert(snapshot.appName === 'Code', 'expected app name');
    assert(snapshot.iconName === 'code', 'expected app icon name');
    assert(snapshot.title === 'Project notes', 'expected title');
    assert(snapshot.windowId === '77', 'expected stable window id');
    assert(snapshot.pid === 1234, 'expected pid');
    assert(snapshot.workspaceIndex === 2, 'expected workspace index');
    assert(snapshot.monitorIndex === 1, 'expected monitor index');
    assert(snapshot.rect.width === 800 && snapshot.rect.height === 600, 'expected frame rect');
    assert(snapshot.state.isAbove === true, 'expected always-on-top state');
    assert(snapshot.command[0] === 'code', 'expected command fallback');
    assert(snapshot.cwd === '/home/me/project', 'expected working directory fallback');
});

test('recordRecentSnapshot deduplicates by app and window identity and caps the list', () => {
    let state = restoreRecentWindowsState('{}');

    for (let i = 0; i < RECENT_WINDOW_LIMIT + 3; i++) {
        state = recordRecentSnapshot(state, 'opened', {
            ...createWindowSnapshot({
                app: fakeApp(),
                window: fakeWindow({
                    get_id: () => i,
                    get_title: () => `Window ${i}`,
                }),
                timestamp: i,
            }),
        });
    }

    state = recordRecentSnapshot(state, 'opened', {
        ...createWindowSnapshot({
            app: fakeApp(),
            window: fakeWindow({
                get_id: () => RECENT_WINDOW_LIMIT + 2,
                get_title: () => 'Updated newest',
            }),
            timestamp: 999,
        }),
    });

    assert(state.opened.length === RECENT_WINDOW_LIMIT, 'expected recent list to be capped');
    assert(state.opened[0].title === 'Updated newest', 'expected duplicate to move to front');
    assert(state.opened.filter(item => item.windowId === String(RECENT_WINDOW_LIMIT + 2)).length === 1,
        'expected duplicate identity to appear once');
});

test('serializeRecentWindowsState keeps only JSON-safe recent arrays', () => {
    let state = {
        opened: [createWindowSnapshot({ app: fakeApp(), window: fakeWindow(), timestamp: 1 })],
        closed: [createWindowSnapshot({ app: fakeApp(), window: fakeWindow({ get_id: () => 88 }), timestamp: 2 })],
        ignored: true,
    };

    let restored = restoreRecentWindowsState(serializeRecentWindowsState(state));

    assert(restored.opened.length === 1, 'expected opened snapshots to survive serialization');
    assert(restored.closed.length === 1, 'expected closed snapshots to survive serialization');
    assert(restored.ignored === undefined, 'expected unknown fields to be discarded');
});
