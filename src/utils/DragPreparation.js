export function getDragDistance(startCoords, currentCoords) {
    let [startX, startY] = startCoords;
    let [currentX, currentY] = currentCoords;

    return Math.sqrt(
        Math.pow(currentX - startX, 2) +
        Math.pow(currentY - startY, 2)
    );
}

export function shouldStartPreparedDrag({
    startCoords,
    currentCoords,
    threshold,
    eventState,
    primaryButtonMask,
}) {
    if (!startCoords || currentCoords == null || threshold == null)
        return false;

    if ((eventState & primaryButtonMask) === 0)
        return false;

    return getDragDistance(startCoords, currentCoords) >= threshold;
}
