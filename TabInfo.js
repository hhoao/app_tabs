const Overview = imports.ui.overview;
const Clutter = imports.gi.Clutter;
var TabInfo = class {
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
        this._label = label;
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

    on_button_press_event(actor, event) {
        if (this._current_window) {
            this._current_window.activate(0);
        }
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

    fadeIn() {
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

    fadeOut() {
        if (!this._btn.visible)
            return;

        this._btn.hide();
        log("divide: " + this._divide)
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
