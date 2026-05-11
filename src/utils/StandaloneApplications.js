export function restoreStandaloneApplications(rawState) {
    try {
        let records = JSON.parse(rawState);
        if (!Array.isArray(records))
            return [];

        return records
            .map(normalizeStandaloneApplication)
            .filter(record => record.appId);
    } catch (_e) {
        return [];
    }
}

export function serializeStandaloneApplications(records) {
    return JSON.stringify((records ?? [])
        .map(normalizeStandaloneApplication)
        .filter(record => record.appId));
}

export function standaloneApplicationIncludes(records, appId) {
    return Boolean(appId && records?.some(record => record.appId === appId));
}

export function addOrUpdateStandaloneApplication(records, application) {
    let nextRecord = normalizeStandaloneApplication(application);
    if (!nextRecord.appId)
        return records ?? [];

    let nextRecords = (records ?? []).filter(record => record.appId !== nextRecord.appId);
    nextRecords.unshift(nextRecord);
    return nextRecords;
}

export function removeStandaloneApplication(records, appId) {
    if (!appId)
        return records ?? [];

    return (records ?? []).filter(record => record.appId !== appId);
}

function normalizeStandaloneApplication(application) {
    return {
        appId: application?.appId ?? '',
        name: application?.name ?? application?.appId ?? '',
        iconName: application?.iconName ?? '',
    };
}
