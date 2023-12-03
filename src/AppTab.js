import Clutter from 'gi://Clutter';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';

export const AppTab = GObject.registerClass({
}, class AppTab extends St.Button {
    _init(props) {
        super._init({
            x_expand: true,
            y_expand: true,
        });
        this._settings = props.settings;
        this._is_dark_mode = props.is_dark_mode;
        this._style_config = props.style_config;
        this._current_window = null;
        this._divide = null;
        this.add_style_class_name('app-tab');

        this._init_controls();
        this._init_icon();
        this._init_label();
        this._init_close_button();

        this.connect('clicked', () => {
            if (this.get_current_window()) {
                this.get_current_window().activate(0);
            }
        });
    }

    set_app_tab_config(config) {
        this._style_config = config;
        if (Number.parseInt(this._style_config['icon-size']) !== this._icon.get_icon_size()) {
            this._icon.set_icon_size(Number.parseInt(this._style_config['icon-size']));
        }
    }

    on_active(window) {
        if (this.get_current_window() === window) {
            this.set_style(this._get_tab_style(true));
            this.hide_divide();
        } else {
            this.set_style(this._get_tab_style());
            if (this.get_current_window() === window) {
                this.hide_divide();
            } else {
                this.show_divide();
            }
        }
    }

    _extract_config_style(style_config, is_active = false, is_hover = false) {
        let tab_style = {...style_config.default_style};
        if (is_hover && style_config.hover_style) {
            let hover_tab_style = {...style_config.hover_style};
            for (let name in hover_tab_style) {
                tab_style[name] = hover_tab_style[name];
            }
        } else if (is_active && style_config.active_style) {
            let active_tab_style = {...style_config.active_style};
            for (let name in active_tab_style) {
                tab_style[name] = active_tab_style[name];
            }
        }
        return tab_style;
    }

    _get_tab_style(is_active = false, is_hover = false) {
        let style = '';
        let tab_style = {}, mode_tab_style= {};
        if (this._style_config.default) {
            tab_style = this._extract_config_style(this._style_config.default, is_active, is_hover);
        }
        if (!this._is_dark_mode && this._style_config.light_mode) {
            mode_tab_style = this._extract_config_style(this._style_config.light_mode, is_active, is_hover);
        } else if (this._is_dark_mode && this._style_config.dark_mode){
            mode_tab_style = this._extract_config_style(this._style_config.dark_mode, is_active, is_hover);
        }
        for (let name in mode_tab_style) {
            tab_style[name] = mode_tab_style[name];
        }
        for (let name in tab_style) {
            style += name + ':' + tab_style[name] + ';';
        }
        return style;
    }

    set_theme(theme) {
        this._is_dark_mode = theme.includes('dark');
    }

    _init_close_button() {
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
        this._controls.add_child(this._close_button);
    }

    _init_controls() {
        this._controls = new St.BoxLayout({
            x_expand: true,
            y_expand: false,
        });
        this._controls.add_style_class_name('app-tab-controller');
        this.add_actor(this._controls);
    }

    _init_icon() {
        this._icon = new St.Icon();
        let icon_size = this._style_config['icon-size'];
        this._icon.set_icon_size(icon_size ? Number.parseInt(this._style_config['icon-size']) : 18);
        this._icon.set_fallback_gicon(null);
        this._icon.add_style_class_name('app-tab-icon');
        this._controls.add_child(this._icon);
    }

    _init_label() {
        this._label = new St.Label({
            text: 'label',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.FILL,
        });
        let enable_ellipsize_mode = this._settings.get_boolean("ellipsize-mode");
        let ellipsize_mode = Pango.EllipsizeMode.NONE;
        if (enable_ellipsize_mode) {
            ellipsize_mode = Pango.EllipsizeMode.END;
        }
        this._label.clutter_text.set_ellipsize(ellipsize_mode);
        this._label.clutter_text.set_line_wrap(false);
        this._label.clutter_text.set_single_line_mode(true);
        this._label.clutter_text.set_line_wrap_mode(Pango.WrapMode.CHAR);
        this._label.clutter_text.set_max_length(10);
        this._label.add_style_class_name('app-tab-label');

        this._controls.add_child(this._label);
    }

    switch_label_ellipsize_mode(value) {
        let ellipsize_mode = Pango.EllipsizeMode.NONE;
        if (value) {
            ellipsize_mode = Pango.EllipsizeMode.END;
        }
        this._label.clutter_text.set_ellipsize(ellipsize_mode);
    }

    destroy() {
        this._icon.destroy();
        this._divide.destroy();
        this._label.destroy();
        this._close_button.destroy();
        this._controls.destroy();
        this._settings = null;
        this._current_window = null;
        this._icon = null;
        this._style_config = null;
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
});
