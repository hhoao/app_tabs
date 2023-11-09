import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DockerContainersPreferences extends ExtensionPreferences {
    get_ellipsize_mode_switch = () => {
        const settings = this.getSettings()
        const ellipsize_mode_switch = new Gtk.Switch({
            active: false,
            valign: Gtk.Align.CENTER,
        });
        settings.bind("ellipsize-mode", ellipsize_mode_switch, "active", Gio.SettingsBindFlags.DEFAULT);
        return ellipsize_mode_switch;
    };

    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Configure the appearance of the extension',
        });
        page.add(group);

        const row = new Adw.ActionRow({
            title: "Enable ellipsis mode of label",
        });
        group.add(row);

        const ellipsize_mode_switch = this.get_ellipsize_mode_switch();

        row.add_suffix(ellipsize_mode_switch);
        row.activatable_widget = ellipsize_mode_switch;

        window.add(page);
    }
}

