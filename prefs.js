import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ApplicationTabPreferences extends ExtensionPreferences {
    get_ellipsize_mode_group = () => {
        let key_name = 'ellipsize-mode';
        const settings = this.getSettings();
        const ellipsize_mode_switch = new Gtk.Switch({
            active: false,
            valign: Gtk.Align.CENTER,
        });
        settings.bind(key_name, ellipsize_mode_switch, 'active', Gio.SettingsBindFlags.DEFAULT);
        const group = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Configure the appearance of the extension',
        });

        const ellipsis_mode_row = new Adw.ActionRow({
            title: 'Enable ellipsis mode of label',
        });
        group.add(ellipsis_mode_row);
        ellipsis_mode_row.add_suffix(ellipsize_mode_switch);
        ellipsis_mode_row.activatable_widget = ellipsize_mode_switch;
        return group;
    };
    get_app_tab_config_group = (window) => {
        const key_name = 'app-tab-config';
        const settings = this.getSettings();
        const app_tab_config_text_view = new Gtk.TextView({
            valign: Gtk.Align.CENTER,
        });
        app_tab_config_text_view.set_wrap_mode(true);
        let text_buffer = app_tab_config_text_view.get_buffer();
        text_buffer.text = settings.get_string(key_name);
        settings.connect(
            'changed::' + key_name,
            (settings, key) => {
                let text = settings.get_string(key);
                text_buffer.set_text(text, text.length);
            },
        );

        const scrolled_window = new Gtk.ScrolledWindow();
        scrolled_window.set_max_content_height(300);
        scrolled_window.set_vadjustment(Gtk.Adjustment.new(0, 0, 1000, 10, 0, 0));
        scrolled_window.set_child(app_tab_config_text_view);
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
        const app_tab_config_group = new Adw.PreferencesGroup({
            title: 'Application Tab Configuration',
            description: 'Configure the appearance of the extension',
        });
        app_tab_config_group.add(scrolled_window);
        app_tab_config_group.add(button_box);
        return app_tab_config_group;
    };

    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        const ellipsize_mode_group = this.get_ellipsize_mode_group();
        const app_tab_config_group = this.get_app_tab_config_group(window);
        page.add(ellipsize_mode_group);
        page.add(app_tab_config_group);
        window.add(page);
    }
}

