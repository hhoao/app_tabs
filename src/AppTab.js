import Clutter from 'gi://Clutter';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import St from 'gi://St';
import GObject from 'gi://GObject';

export const AppTab = GObject.registerClass({
}, class AppTab extends St.Button {
    _init(props) {
        super._init({
            x_expand: true,
            y_expand: true,
        });
        this._current_window = null;
        this._divide = null;

        this.add_style_class_name('app-tab')
        this._controls = new St.BoxLayout({
            x_expand: true,
            y_expand: false,
        })
        this._controls.add_style_class_name("app-tab-controller");
        this.add_actor(this._controls)
        this._label = new St.Label({
            text: 'label',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._label.add_style_class_name('app-tab-label');
        const close_button = new St.Button({
            label: '×',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.END,
        });
        close_button.connect('clicked', () => {
            if (this.get_current_window()) {
                this.get_current_window().delete(0);
            }
        });
        close_button.add_style_class_name('app-tab-close-button');
        this._controls.add_child(this._label)
        this._controls.add_child(close_button)

        this.connect('clicked', () => {
            if (this.get_current_window()) {
                this.get_current_window().activate(0);
            }
        });
    }

    get_divide() {
        return this._divide;
    }

    set_divide(divide) {
        this._divide = divide;
    }

    hide_divide() {
        this._divide.hide();
    }
    show_divide() {
        this._divide.show();
    }

    is_active() {
        return this._current_window != null;
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
        if (this.visible) {
            return;
        }
        this.show();
        this.remove_all_transitions();
        this.ease({
            opacity: 255,
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    fade_out() {
        if (!this.visible) {
            return;
        }

        this.hide();
        if (this._divide) {
            this._divide.hide();
        }
        this.remove_all_transitions();
        this.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Overview.ANIMATION_TIME,
        });
    }
})
