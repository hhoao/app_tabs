const MIN_TAB_HEIGHT = 20;
const PANEL_VERTICAL_PADDING = 10;
const TAB_BORDER_RADIUS = 8;
const LEGACY_DEFAULT_STYLE = {
    'margin': '4px 0',
    'border-radius': '8px',
    'margin-left': '2px',
    'color': 'white',
};
const LEGACY_ACTIVE_STYLE = {
    'background': '#4b4b4b',
};

function mergeStyle(target, source) {
    if (!source)
        return target;

    for (let name in source)
        target[name] = source[name];

    return target;
}

function extractConfigStyle(styleConfig, isActive = false, isHover = false) {
    let tabStyle = {};
    mergeStyle(tabStyle, styleConfig?.default_style);

    if (isHover)
        mergeStyle(tabStyle, styleConfig?.hover_style);
    else if (isActive)
        mergeStyle(tabStyle, styleConfig?.active_style);

    return tabStyle;
}

function hasOnlyStyle(style = {}, expected = {}) {
    let styleKeys = Object.keys(style);
    let expectedKeys = Object.keys(expected);
    if (styleKeys.length !== expectedKeys.length)
        return false;

    return expectedKeys.every(key => style[key] === expected[key]);
}

function hasEmptyStateStyles(modeConfig = {}) {
    return hasOnlyStyle(modeConfig.default_style, {}) &&
        hasOnlyStyle(modeConfig.active_style, {}) &&
        hasOnlyStyle(modeConfig.hover_style, {});
}

function isLegacyDefaultConfig(styleConfig = {}) {
    return hasOnlyStyle(styleConfig.default?.default_style, LEGACY_DEFAULT_STYLE) &&
        hasOnlyStyle(styleConfig.default?.active_style, LEGACY_ACTIVE_STYLE) &&
        hasOnlyStyle(styleConfig.default?.hover_style, LEGACY_ACTIVE_STYLE) &&
        hasEmptyStateStyles(styleConfig.light_mode) &&
        hasEmptyStateStyles(styleConfig.dark_mode);
}

function getAdaptiveTabStyle(isDarkMode, isActive, isHover, panelHeight) {
    let minHeight = Math.max(MIN_TAB_HEIGHT, panelHeight - PANEL_VERTICAL_PADDING);
    let style = {
        'margin': '0 2px',
        'border-radius': `${TAB_BORDER_RADIUS}px`,
        'color': isDarkMode ? '#ffffff' : '#242424',
        'min-height': `${minHeight}px`,
        'transition-duration': '0.2s',
        'transition-property': 'background-color, color',
    };

    if (isHover) {
        style['background'] = isDarkMode
            ? 'rgba(255, 255, 255, 0.12)'
            : 'rgba(0, 0, 0, 0.08)';
    } else if (isActive) {
        style['background'] = isDarkMode
            ? 'rgba(255, 255, 255, 0.16)'
            : 'rgba(0, 0, 0, 0.12)';
    } else {
        style['background'] = 'transparent';
    }

    return style;
}

function styleObjectToString(style) {
    let styleText = '';

    for (let name in style)
        styleText += `${name}:${style[name]};`;

    return styleText;
}

export function isDarkTheme({ gtkTheme = '', colorScheme = '' } = {}) {
    let normalizedColorScheme = String(colorScheme ?? '').toLowerCase();
    if (normalizedColorScheme.includes('prefer-light'))
        return false;
    if (normalizedColorScheme.includes('prefer-dark'))
        return true;

    return String(gtkTheme ?? '').toLowerCase().includes('dark');
}

export function buildTabStyle({
    styleConfig = {},
    isDarkMode = false,
    isActive = false,
    isHover = false,
    panelHeight = MIN_TAB_HEIGHT + PANEL_VERTICAL_PADDING,
} = {}) {
    styleConfig = isLegacyDefaultConfig(styleConfig) ? {} : styleConfig;

    let tabStyle = getAdaptiveTabStyle(isDarkMode, isActive, isHover, panelHeight);
    mergeStyle(tabStyle, extractConfigStyle(styleConfig?.default, isActive, isHover));

    let modeStyle = isDarkMode ? styleConfig?.dark_mode : styleConfig?.light_mode;
    mergeStyle(tabStyle, extractConfigStyle(modeStyle, isActive, isHover));

    return styleObjectToString(tabStyle);
}

export function buildCloseButtonStyle(isDarkMode, isHover = false) {
    let style = {
        'border-radius': '16px',
        'transition-duration': '0.2s',
        'transition-property': 'background-color',
    };

    if (isHover) {
        style['background'] = isDarkMode
            ? 'rgba(255, 255, 255, 0.14)'
            : 'rgba(0, 0, 0, 0.10)';
    } else {
        style['background'] = 'transparent';
    }

    return styleObjectToString(style);
}

export function buildDividerStyle(isDarkMode, panelHeight = MIN_TAB_HEIGHT + PANEL_VERTICAL_PADDING) {
    let background = isDarkMode
        ? 'rgba(255, 255, 255, 0.24)'
        : 'rgba(0, 0, 0, 0.18)';
    let minHeight = Math.max(MIN_TAB_HEIGHT, panelHeight - PANEL_VERTICAL_PADDING);
    let dividerHeight = Math.max(1, minHeight - (TAB_BORDER_RADIUS * 2));
    let verticalMargin = Math.max(3, Math.floor((panelHeight - dividerHeight) / 2));

    return styleObjectToString({
        'height': `${dividerHeight}px`,
        'min-height': `${dividerHeight}px`,
        'max-height': `${dividerHeight}px`,
        'margin-top': `${verticalMargin}px`,
        'margin-bottom': `${verticalMargin}px`,
        'background-color': background,
    });
}
