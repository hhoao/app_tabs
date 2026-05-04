import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SchemaKeyConstants} from './src/config/SchemaKeyConstants.js';
import {PrefsStrings} from './src/locale/PrefsStrings.js';

export default class ApplicationTabPreferences extends ExtensionPreferences {
    open_uri(uri) {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (e) {
            console.error(`[AppTabs] Failed to open uri ${uri}: ${e}`);
        }
    }

    get_about_header_group() {
        const group = new Adw.PreferencesGroup();
        const extensionName = this.metadata?.name ?? PrefsStrings.defaultExtensionName;
        const iconPath = `${this.path}/assets/icon.svg`;
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 20,
            margin_bottom: 20,
            margin_start: 20,
            margin_end: 20,
            halign: Gtk.Align.CENTER,
        });

        const icon = new Gtk.Image({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(iconPath) }),
            pixel_size: 72,
            halign: Gtk.Align.CENTER,
        });
        const title = new Gtk.Label({
            label: extensionName,
            halign: Gtk.Align.CENTER,
            css_classes: ['title-1'],
        });
        const maintainer = new Gtk.Label({
            label: PrefsStrings.maintainedBy,
            halign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });

        card.append(icon);
        card.append(title);
        card.append(maintainer);
        group.add(card);
        return group;
    }

    get_about_meta_group() {
        const group = new Adw.PreferencesGroup();
        const versionValue = this.metadata?.version?.toString?.() ?? PrefsStrings.developmentBuild;

        const versionRow = new Adw.ActionRow({
            title: PrefsStrings.version,
        });
        const versionLabel = new Gtk.Label({
            label: versionValue,
            valign: Gtk.Align.CENTER,
        });
        versionRow.add_suffix(versionLabel);
        group.add(versionRow);

        const releaseNote = new Adw.ExpanderRow({
            title: PrefsStrings.releaseNotes,
        });
        const releaseText = new Adw.ActionRow({
            title: PrefsStrings.currentRelease,
            subtitle: PrefsStrings.releaseSubtitle,
        });
        releaseNote.add_row(releaseText);
        group.add(releaseNote);
        return group;
    }

    get_about_links_group() {
        const group = new Adw.PreferencesGroup();
        const url = this.metadata?.url ?? '';

        const siteRow = this.create_external_link_row(
            PrefsStrings.extensionListing,
            PrefsStrings.applicationTabs,
            'https://extensions.gnome.org/extension/6254/application-tabs/',
        );
        group.add(siteRow);

        const sourceRow = this.create_external_link_row(
            PrefsStrings.sourceCode,
            PrefsStrings.github,
            url || 'https://github.com/',
        );
        group.add(sourceRow);

        const issueRow = this.create_external_link_row(
            PrefsStrings.reportAnIssue,
            PrefsStrings.issues,
            url ? `${url}/issues` : 'https://github.com/',
        );
        group.add(issueRow);

        const contributorRow = this.create_external_link_row(
            PrefsStrings.contributors,
            PrefsStrings.contributorGraph,
            'https://github.com/hhoao/app_tabs/graphs/contributors',
        );
        group.add(contributorRow);

        return group;
    }

    create_external_link_row(title, label, uri) {
        const row = new Adw.ActionRow({
            title,
            activatable: true,
        });
        const linkButton = new Gtk.LinkButton({
            uri,
            label,
            valign: Gtk.Align.CENTER,
        });
        const externalIcon = new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        });
        row.add_suffix(linkButton);
        row.add_suffix(externalIcon);
        row.activatable_widget = linkButton;
        return row;
    }

    get_about_page() {
        const page = new Adw.PreferencesPage({
            title: PrefsStrings.about,
            icon_name: 'help-about-symbolic',
        });
        page.add(this.get_about_header_group());
        page.add(this.get_about_meta_group());
        page.add(this.get_about_links_group());
        return page;
    }

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
            title: PrefsStrings.appearance,
            description: PrefsStrings.appearanceDescription,
        });
        const ellipsize_mode_switch = this.get_ellipsize_mode_row(settings);
        const only_display_current_workspace_tabs_switch = this.get_only_display_current_workspace_row(settings);
        const max_width_row = this.get_max_width_row(settings);
        group.add(max_width_row);
        group.add(ellipsize_mode_switch);
        group.add(only_display_current_workspace_tabs_switch);
        return group;
    }
    get_max_width_row(settings) {
        const row = new Adw.ActionRow({
            title: PrefsStrings.panelMaxWidth,
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
            title: PrefsStrings.enableEllipsisForTabLabels,
        });
        ellipsis_mode_row.add_suffix(ellipsize_mode_switch);
        ellipsis_mode_row.activatable_widget = ellipsize_mode_switch;
        return ellipsis_mode_row;
    };

    get_only_display_current_workspace_row = (settings) => {
        const key_name = SchemaKeyConstants.ONLY_DISPLAY_TABS_ON_CURRENT_WORKSPACE;
        const gtk_switch = new Gtk.Switch({
            active: true,
            valign: Gtk.Align.CENTER,
        });
        settings.bind(key_name, gtk_switch, 'active', Gio.SettingsBindFlags.DEFAULT);

        const action_row = new Adw.ActionRow({
            title: PrefsStrings.onlyShowTabsOnCurrentWorkspace,
        });
        action_row.add_suffix(gtk_switch);
        action_row.activatable_widget = gtk_switch;
        return action_row;
    };

    get_app_tab_config_group = (settings, window) => {
        const app_tab_config_group = new Adw.PreferencesGroup({
            title: PrefsStrings.tabAppearanceJson,
            description: PrefsStrings.tabAppearanceJsonDescription,
        });

        const text_view_wrapper = this.get_text_view_wrapper(settings, SchemaKeyConstants.APP_TAB_CONFIG);

        app_tab_config_group.add(text_view_wrapper.scrolled_window);
        app_tab_config_group.add(text_view_wrapper.button_box);

        return app_tab_config_group;
    };
    get_text_view_wrapper(settings, key_name) {
        const scrolled_window = new Gtk.ScrolledWindow();
        scrolled_window.set_max_content_height(400);
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
            label: PrefsStrings.apply,
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
            label: PrefsStrings.format,
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
            label: PrefsStrings.revert,
        });
        reset_button.connect('clicked', () => {
            let text = settings.get_string(key_name);
            text_buffer.set_text(text, text.length);
        });
        const reset_default_button = new Gtk.Button({
            label: PrefsStrings.restoreDefaults,
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
            title: PrefsStrings.general,
            icon_name: 'dialog-information-symbolic',
        });
        const app_tab_config_group = this.get_app_tab_config_group(settings, window);
        const appearance_group = this.get_appearance_group(settings);
        page.add(appearance_group);
        page.add(app_tab_config_group);
        window.add(page);
        window.add(this.get_about_page());
    }
}

