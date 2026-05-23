import Clutter from 'gi://Clutter';
import { SchemaKeyConstants } from '../config/SchemaKeyConstants.js';

export function getDisplayModeTransitionDuration(settings) {
    if (!settings.get_boolean(SchemaKeyConstants.ENABLE_DISPLAY_MODE_TRANSITION))
        return 0;

    return Math.max(0, settings.get_int(SchemaKeyConstants.DISPLAY_MODE_TRANSITION_DURATION));
}

export function applyOpacityTransition(actor, opacity, settings, onComplete = null) {
    let duration = getDisplayModeTransitionDuration(settings);
    actor.remove_transition?.('opacity');
    if (duration <= 0) {
        actor.opacity = opacity;
        onComplete?.();
        return;
    }

    actor.ease({
        opacity,
        duration,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete,
    });
}

export function applyPanelBoxYTransition(panelBox, targetY, settings, onComplete = null) {
    let duration = getDisplayModeTransitionDuration(settings);
    panelBox.remove_all_transitions?.();
    if (duration <= 0) {
        panelBox.y = targetY;
        onComplete?.();
        return;
    }

    panelBox.ease({
        y: targetY,
        duration,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete,
    });
}
