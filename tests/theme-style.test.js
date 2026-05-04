import {
    buildAddButtonStyle,
    buildCloseButtonStyle,
    buildDividerStyle,
    buildTabStyle,
    isDarkTheme,
} from '../src/utils/ThemeStyle.js';

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

test('isDarkTheme detects dark mode from color scheme', () => {
    assert(isDarkTheme({ colorScheme: 'prefer-dark', gtkTheme: 'Adwaita' }) === true,
        'prefer-dark should be dark');
    assert(isDarkTheme({ colorScheme: 'prefer-light', gtkTheme: 'Adwaita-dark' }) === false,
        'prefer-light should override a dark gtk theme name');
});

test('isDarkTheme falls back to gtk theme name', () => {
    assert(isDarkTheme({ colorScheme: 'default', gtkTheme: 'Yaru-dark' }) === true,
        'dark gtk theme names should be dark');
    assert(isDarkTheme({ colorScheme: 'default', gtkTheme: 'Adwaita' }) === false,
        'non-dark gtk theme names should be light');
});

test('buildTabStyle supplies adaptive light and dark defaults', () => {
    let lightStyle = buildTabStyle({
        styleConfig: {},
        isDarkMode: false,
        isActive: true,
        panelHeight: 32,
    });
    let darkStyle = buildTabStyle({
        styleConfig: {},
        isDarkMode: true,
        isActive: true,
        panelHeight: 32,
    });

    assert(lightStyle.includes('color:#242424;'), 'light tabs should use dark text');
    assert(darkStyle.includes('color:#ffffff;'), 'dark tabs should use light text');
    assert(lightStyle.includes('background:rgba(0, 0, 0, 0.12);'),
        'light active tabs should use a subtle dark overlay');
    assert(darkStyle.includes('background:rgba(255, 255, 255, 0.16);'),
        'dark active tabs should use a subtle light overlay');
});

test('buildTabStyle lets user config override adaptive defaults', () => {
    let style = buildTabStyle({
        styleConfig: {
            default: {
                default_style: {
                    color: 'red',
                },
                active_style: {
                    background: 'blue',
                },
            },
            dark_mode: {
                active_style: {
                    background: 'green',
                },
            },
        },
        isDarkMode: true,
        isActive: true,
        panelHeight: 32,
    });

    assert(style.includes('color:red;'), 'default user color should override adaptive color');
    assert(style.includes('background:green;'), 'mode-specific active background should win');
});

test('buildTabStyle treats the legacy hard-coded default as adaptive', () => {
    let style = buildTabStyle({
        styleConfig: {
            default: {
                default_style: {
                    margin: '4px 0',
                    'border-radius': '8px',
                    'margin-left': '2px',
                    color: 'white',
                },
                active_style: {
                    background: '#4b4b4b',
                },
                hover_style: {
                    background: '#4b4b4b',
                },
            },
            light_mode: {
                default_style: {},
                active_style: {},
                hover_style: {},
            },
            dark_mode: {
                default_style: {},
                active_style: {},
                hover_style: {},
            },
        },
        isDarkMode: false,
        isActive: true,
        panelHeight: 32,
    });

    assert(style.includes('color:#242424;'),
        'legacy default color should not force white text in light mode');
    assert(style.includes('background:rgba(0, 0, 0, 0.12);'),
        'legacy default active background should not force dark mode color');
});

test('buildTabStyle preserves explicit user colors', () => {
    let style = buildTabStyle({
        styleConfig: {
            default: {
                default_style: {
                    color: 'white',
                },
                active_style: {
                    background: '#4b4b4b',
                    border: '1px solid red',
                },
            },
        },
        isDarkMode: false,
        isActive: true,
        panelHeight: 32,
    });

    assert(style.includes('color:white;'), 'non-legacy user color should be preserved');
    assert(style.includes('background:#4b4b4b;'), 'non-legacy user background should be preserved');
});

test('buildTabStyle adjusts vertical spacing from panel height', () => {
    let compactStyle = buildTabStyle({
        styleConfig: {},
        isDarkMode: false,
        panelHeight: 26,
    });
    let tallStyle = buildTabStyle({
        styleConfig: {},
        isDarkMode: false,
        panelHeight: 44,
    });

    assert(compactStyle.includes('min-height:20px;'), 'compact panel should keep tabs compact');
    assert(tallStyle.includes('min-height:30px;'), 'tall panel should grow tab hit area');
});

test('buildDividerStyle adjusts separator margins from panel height', () => {
    let compactStyle = buildDividerStyle(false, 26);
    let tallStyle = buildDividerStyle(false, 44);

    assert(compactStyle.includes('margin-top:11px;'), 'compact panel separator should align to tab edge');
    assert(tallStyle.includes('margin-top:15px;'), 'tall panel separator should align to tab edge');
});

test('buildDividerStyle matches rounded tab vertical edge height', () => {
    let style = buildDividerStyle(false, 44);

    assert(style.includes('height:14px;'), 'divider height should exclude rounded corners');
    assert(style.includes('min-height:14px;'), 'divider min-height should exclude rounded corners');
});

test('buildAddButtonStyle supplies visible light and dark hover states', () => {
    let lightStyle = buildAddButtonStyle(false, true);
    let darkStyle = buildAddButtonStyle(true, true);

    assert(lightStyle.includes('width:24px;') && lightStyle.includes('height:24px;'),
        'add button hover background should leave padding around the icon');
    assert(lightStyle.includes('padding:1px;'),
        'add button should have a little padding around the plus icon');
    assert(lightStyle.includes('border-radius:999px;'),
        'add button hover background should be rounded into a circle');
    assert(lightStyle.includes('background:rgba(0, 0, 0, 0.08);'),
        'light add button hover should use a visible dark overlay');
    assert(darkStyle.includes('background:rgba(255, 255, 255, 0.12);'),
        'dark add button hover should use a visible light overlay');
});

test('buildCloseButtonStyle uses the same circular hover shape as the add button', () => {
    let style = buildCloseButtonStyle(false, true);

    assert(style.includes('width:24px;') && style.includes('height:24px;'),
        'close button hover background should be a square before rounding');
    assert(style.includes('border-radius:999px;'),
        'close button hover background should be rounded into a circle');
});
