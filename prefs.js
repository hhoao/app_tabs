import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SchemaKeyConstants} from './src/config/SchemaKeyConstants.js';

export default class ApplicationTabPreferences extends ExtensionPreferences {
    get_spin_button= (settings, key_name) => {
        const spin = new Gtk.SpinButton({
            valign: Gtk.Align.CENTER,
            climb_rate: 10,
            digits: 0,
            snap_to_ticks: true,
            adjustment: new Gtk.Adjustment({
                lower: -1,
                upper: 3600,
                step_increment: 100,
                page_size: 0,
            }),
        });
        settings.bind(key_name, spin, "value", Gio.SettingsBindFlags.DEFAULT);
        return spin;
    };
    get_appearance_group(settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Configure the appearance of the extension',
        });
        const ellipsize_mode_switch = this.get_ellipsize_mode_row(settings);
        const max_width_row = this.get_max_width_row(settings);
        group.add(max_width_row);
        group.add(ellipsize_mode_switch);
        return group;
    }
    get_max_width_row(settings) {
        const row = new Adw.ActionRow({
            title: "Panel max width",
        });
        const spin_button = this.get_spin_button(settings, SchemaKeyConstants.PANEL_MAX_WIDTH)
        row.add_suffix(spin_button);
        row.activatable_widget = spin_button;
        return row;
    }
    get_ellipsize_mode_row= (settings) => {
        const key_name = SchemaKeyConstants.ELLIPSIZE_MODE;
        const ellipsize_mode_switch = new Gtk.Switch({
            active: false,
            valign: Gtk.Align.CENTER,
        });
        settings.bind(key_name, ellipsize_mode_switch, 'active', Gio.SettingsBindFlags.DEFAULT);

        const ellipsis_mode_row = new Adw.ActionRow({
            title: 'Enable ellipsis mode of label',
        });
        ellipsis_mode_row.add_suffix(ellipsize_mode_switch);
        ellipsis_mode_row.activatable_widget = ellipsize_mode_switch;
        return ellipsis_mode_row;
    };
    get_app_tab_config_group = (settings, window) => {
        const app_tab_config_group = new Adw.PreferencesGroup({
            title: 'Application Tab Configuration',
            description: 'Configure the appearance of the application tab',
        });

        const text_view_wrapper = this.get_text_view_wrapper(settings, SchemaKeyConstants.APP_TAB_CONFIG);

        app_tab_config_group.add(text_view_wrapper.scrolled_window);
        app_tab_config_group.add(text_view_wrapper.button_box);

        return app_tab_config_group;
    };
    get_text_view_wrapper(settings, key_name) {
        const scrolled_window = new Gtk.ScrolledWindow();
        scrolled_window.set_max_content_height(300);
        scrolled_window.set_min_content_height(100);
        scrolled_window.set_vadjustment(Gtk.Adjustment.new(0, 0, 1000, 10, 0, 0));
        const app_tab_config_text_view = new Gtk.TextView({
            valign: Gtk.Align.CENTER,
        });
        app_tab_config_text_view.set_wrap_mode(true);
        const text_buffer = app_tab_config_text_view.get_buffer();
        text_buffer.text = settings.get_string(key_name);
        settings.connect(
            'changed::' + key_name,
            (settings, key) => {
                let text = settings.get_string(key);
                text_buffer.set_text(text, text.length);
            },
        );
        const button_box = this.get_text_button_box(settings, text_buffer, key_name);
        scrolled_window.set_child(app_tab_config_text_view);
        return {scrolled_window, button_box};
    }

    get_text_button_box(settings, text_buffer, key_name) {
        const button_box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
        });
        button_box.set_margin_top(10);
        const confirm_button = new Gtk.Button({
            label: 'Confirm',
        });
        confirm_button.connect('clicked', () => {
            try {
                JSON.parse(text_buffer.text);
                settings.set_string(key_name, text_buffer.text);
            } catch (e) {
                let dialog = new Gtk.AlertDialog();
                dialog.set_message(e.toString());
                dialog.show(window);
            }
        });
        const format_button = new Gtk.Button({
            label: 'Format',
        });
        format_button.connect('clicked', () => {
            try {
                text_buffer.text = JSON.stringify(JSON.parse(text_buffer.text), null, 4);
            } catch (e) {
                let dialog = new Gtk.AlertDialog();
                dialog.set_message(e.toString());
                dialog.show(window);
            }
        });
        const reset_button = new Gtk.Button({
            label: 'Reset',
        });
        reset_button.connect('clicked', () => {
            let text = settings.get_string(key_name);
            text_buffer.set_text(text, text.length);
        });
        const reset_default_button = new Gtk.Button({
            label: 'Reset Default',
        });
        reset_default_button.connect('clicked', () => {
            let default_value = settings.get_default_value(key_name).get_string();
            text_buffer.set_text(default_value[0], default_value[1]);
        });
        button_box.append(confirm_button);
        button_box.append(format_button);
        button_box.append(reset_button);
        button_box.append(reset_default_button);
        return button_box;
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        const app_tab_config_group = this.get_app_tab_config_group(settings, window);
        const appearance_group = this.get_appearance_group(settings);
        page.add(appearance_group);
        page.add(app_tab_config_group);
        window.add(page);
    }
}

