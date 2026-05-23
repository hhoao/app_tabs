export const RECENT_WINDOW_LIMIT = 20;

function callString(obj, methodName, fallback = '') {
    try {
        let value = obj?.[methodName]?.();
        if (value === null || value === undefined)
            return fallback;
        return String(value);
    } catch (_e) {
        return fallback;
    }
}

function callNumber(obj, methodName, fallback = null) {
    try {
        let value = obj?.[methodName]?.();
        return Number.isFinite(value) ? value : fallback;
    } catch (_e) {
        return fallback;
    }
}

function callBoolean(obj, methodName, fallback = false) {
    try {
        return Boolean(obj?.[methodName]?.());
    } catch (_e) {
        return fallback;
    }
}

function getAppInfo(app) {
    try {
        return app?.get_app_info?.() ?? null;
    } catch (_e) {
        return null;
    }
}

function getAppIconName(app) {
    try {
        let value = app?.get_icon?.()?.to_string?.();
        if (value === null || value === undefined)
            return '';
        return String(value);
    } catch (_e) {
        return '';
    }
}

function getWorkspaceIndex(window) {
    try {
        return window?.get_workspace?.()?.index?.() ?? null;
    } catch (_e) {
        return null;
    }
}

function getFrameRect(window) {
    try {
        let rect = window?.get_frame_rect?.();
        if (!rect)
            return null;

        return {
            x: rect.x ?? 0,
            y: rect.y ?? 0,
            width: rect.width ?? 0,
            height: rect.height ?? 0,
        };
    } catch (_e) {
        return null;
    }
}

function getWindowId(window) {
    let id = callString(window, 'get_id');
    if (id)
        return id;

    return callString(window, 'get_description');
}

function getSnapshotIdentity(snapshot) {
    let windowIdentity = snapshot.windowId || snapshot.title || '';
    return [
        snapshot.appId || '',
        snapshot.wmClass || '',
        windowIdentity,
    ].join('|');
}

function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object')
        return null;

    return {
        appId: String(snapshot.appId ?? ''),
        appName: String(snapshot.appName ?? ''),
        iconName: String(snapshot.iconName ?? ''),
        desktopFilePath: String(snapshot.desktopFilePath ?? ''),
        title: String(snapshot.title ?? ''),
        windowId: String(snapshot.windowId ?? ''),
        pid: Number.isFinite(snapshot.pid) ? snapshot.pid : null,
        wmClass: String(snapshot.wmClass ?? ''),
        wmClassInstance: String(snapshot.wmClassInstance ?? ''),
        workspaceIndex: Number.isFinite(snapshot.workspaceIndex) ? snapshot.workspaceIndex : null,
        monitorIndex: Number.isFinite(snapshot.monitorIndex) ? snapshot.monitorIndex : null,
        isOnPrimaryMonitor: Boolean(snapshot.isOnPrimaryMonitor),
        rect: snapshot.rect && typeof snapshot.rect === 'object' ? {
            x: Number(snapshot.rect.x) || 0,
            y: Number(snapshot.rect.y) || 0,
            width: Number(snapshot.rect.width) || 0,
            height: Number(snapshot.rect.height) || 0,
        } : null,
        state: snapshot.state && typeof snapshot.state === 'object' ? {
            fullscreen: Boolean(snapshot.state.fullscreen),
            minimized: Boolean(snapshot.state.minimized),
            isAbove: Boolean(snapshot.state.isAbove),
            isSticky: Boolean(snapshot.state.isSticky),
            isMaximized: Boolean(snapshot.state.isMaximized),
        } : {
            fullscreen: false,
            minimized: false,
            isAbove: false,
            isSticky: false,
            isMaximized: false,
        },
        command: Array.isArray(snapshot.command)
            ? snapshot.command.map(value => String(value)).filter(Boolean)
            : null,
        cwd: String(snapshot.cwd ?? ''),
        timestamp: Number.isFinite(snapshot.timestamp) ? snapshot.timestamp : Date.now(),
    };
}

function normalizeSnapshots(snapshots) {
    if (!Array.isArray(snapshots))
        return [];

    return snapshots
        .map(normalizeSnapshot)
        .filter(Boolean)
        .slice(0, RECENT_WINDOW_LIMIT);
}

export function createWindowSnapshot({
    app,
    window,
    timestamp = Date.now(),
    command = null,
    cwd = '',
} = {}) {
    let appInfo = getAppInfo(app);

    return normalizeSnapshot({
        appId: callString(app, 'get_id'),
        appName: callString(app, 'get_name'),
        iconName: getAppIconName(app),
        desktopFilePath: callString(appInfo, 'get_filename'),
        title: callString(window, 'get_title'),
        windowId: getWindowId(window),
        pid: callNumber(window, 'get_pid'),
        wmClass: callString(window, 'get_wm_class'),
        wmClassInstance: callString(window, 'get_wm_class_instance'),
        workspaceIndex: getWorkspaceIndex(window),
        monitorIndex: callNumber(window, 'get_monitor'),
        isOnPrimaryMonitor: callBoolean(window, 'is_on_primary_monitor'),
        rect: getFrameRect(window),
        state: {
            fullscreen: callBoolean(window, 'is_fullscreen'),
            minimized: Boolean(window?.minimized),
            isAbove: callBoolean(window, 'is_above'),
            isSticky: callBoolean(window, 'is_on_all_workspaces'),
            isMaximized: callBoolean(window, 'is_maximized'),
        },
        command,
        cwd,
        timestamp,
    });
}

export function restoreRecentWindowsState(serialized) {
    try {
        let state = typeof serialized === 'string' && serialized
            ? JSON.parse(serialized)
            : {};

        return {
            opened: normalizeSnapshots(state.opened),
            closed: normalizeSnapshots(state.closed),
        };
    } catch (_e) {
        return { opened: [], closed: [] };
    }
}

export function serializeRecentWindowsState(state) {
    let normalized = restoreRecentWindowsState(JSON.stringify({
        opened: state?.opened ?? [],
        closed: state?.closed ?? [],
    }));

    return JSON.stringify(normalized);
}

export function recordRecentSnapshot(state, section, snapshot, limit = RECENT_WINDOW_LIMIT) {
    let normalized = restoreRecentWindowsState(serializeRecentWindowsState(state));
    let normalizedSnapshot = normalizeSnapshot(snapshot);
    if (!normalizedSnapshot || !['opened', 'closed'].includes(section))
        return normalized;

    let identity = getSnapshotIdentity(normalizedSnapshot);
    let list = normalized[section].filter(item => getSnapshotIdentity(item) !== identity);
    list.unshift(normalizedSnapshot);
    normalized[section] = list.slice(0, limit);
    return normalized;
}
