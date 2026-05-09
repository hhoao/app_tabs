import {
    parseCmdlineBytes,
    shouldUseCommandForRestore,
} from '../src/utils/ProcessLaunchContext.js';

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

test('parseCmdlineBytes turns proc cmdline bytes into argv', () => {
    let bytes = new TextEncoder().encode('code\0/home/me/project\0');

    let argv = parseCmdlineBytes(bytes);

    assert(argv.length === 2, 'expected two command arguments');
    assert(argv[0] === 'code', 'expected command name');
    assert(argv[1] === '/home/me/project', 'expected project path argument');
});

test('shouldUseCommandForRestore accepts project-aware commands', () => {
    assert(shouldUseCommandForRestore(['code', '/home/me/project']),
        'expected command with project path to be restorable');
    assert(shouldUseCommandForRestore(['code', '--folder-uri', 'file:///home/me/project']),
        'expected command with folder uri to be restorable');
});

test('shouldUseCommandForRestore rejects helper renderer processes', () => {
    assert(!shouldUseCommandForRestore(['/usr/share/code/code', '--type=renderer']),
        'expected electron helper process to be rejected');
    assert(!shouldUseCommandForRestore(['chrome', '--type=gpu-process']),
        'expected chromium helper process to be rejected');
});
