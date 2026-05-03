export function getDividerVisibility(activeStates = []) {
    return Array.from({ length: activeStates.length + 1 }, (unused, index) => {
        if (index === 0)
            return false;
        if (index === activeStates.length)
            return false;

        return !activeStates[index - 1] && !activeStates[index];
    });
}
