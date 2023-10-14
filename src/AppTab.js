import Clutter from 'gi://Clutter';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
export default class AppTab {
    constructor() {
        this._current_window = null;
        this._btn = null;
        this._label = null;
        this._divide = null;
    }

    get_divide() {
        return this._divide;
    }
    set_divide(divide) {
        this._divide = divide;
    }
    set_label(label) {
        this._label = label;
    }

    get_label(label) {
        return this._label;
    }

    is_active() {
        return this._current_window != null;
    }
    set_btn(btn) {
        this._btn = btn;
    }
    get_btn(btn) {
        return this._btn;
    }

    set_current_window(window) {
        this._current_window = window;
    }

    get_current_window() {
        return this._current_window;
    }

    set_text(text) {
        this._label.set_text(text);
    }

    get_text() {
        return this._label.get_text();
    }

    fade_in() {
        if (this._btn.visible)
            return;

        this._btn.show();
        this._btn.remove_all_transitions();
        this._btn.ease({
            opacity: 255,
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    fade_out() {
        if (!this._btn.visible)
            return;

        this._btn.hide();
        if (this._divide) {
            this._divide.hide();
        }
        this._btn.remove_all_transitions();
        this._btn.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Overview.ANIMATION_TIME,
        });
    }
}
