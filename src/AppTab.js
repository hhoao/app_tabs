import Clutter from 'gi://Clutter';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import St from 'gi://St';
import GObject from 'gi://GObject';

export const AppTab = GObject.registerClass({
}, class AppTab extends St.Button {
    _init() {
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
        this._icon = new St.Icon()
        this._icon.set_icon_size(18)
        this._icon.set_fallback_gicon(null)
        this._icon.add_style_class_name("app-tab-icon");
        this._label = new St.Label({
            text: 'label',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._label.add_style_class_name('app-tab-label');
        this._close_button = new St.Button({
            label: '×',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.END,
        });
        this._close_button.connect('clicked', () => {
            if (this.get_current_window()) {
                this.get_current_window().delete(0);
            }
        });
        this._close_button.add_style_class_name('app-tab-close-button');
        this._controls.add_child(this._icon);
        this._controls.add_child(this._label)
        this._controls.add_child(this._close_button)

        this.connect('clicked', () => {
            if (this.get_current_window()) {
                this.get_current_window().activate(0);
            }
        });
    }

    destroy() {
        this._current_window = null;
        this._icon.destroy();
        this._divide.destroy()
        this._label.destroy();
        this._close_button.destroy();
        this._controls.destroy();
        this._icon = null;
        this._controls = null;
        this._label = null;
        this._divide = null;
        super.destroy();
    }

    set_icon(gio_icon) {
        this._icon.set_gicon(gio_icon);
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
