import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { getDividerVisibility } from './utils/DividerVisibility.js';
import {
    buildAddButtonStyle,
    buildDividerStyle,
} from './utils/ThemeStyle.js';

export class TabControls {
    constructor({ isDarkMode, panelHeight, onAddTab = null, onShowRecentWindows = null, onToggleDisplayMode = null }) {
        this.actor = new St.BoxLayout({ style_class: 'app-tabs-box' });
        this._tabs = [];
        this._tab_divider_pool = [];
        this._drag_placeholder = null;
        this._is_dark_mode = isDarkMode;
        this._panel_height = panelHeight;
        this._recent_windows_divider = this._create_divider();
        this._is_recent_windows_visible = true;
        this._is_recent_windows_button_hover = false;
        this._on_show_recent_windows = onShowRecentWindows ?? (() => {});
        this._recent_windows_button = this._create_recent_windows_button();
        this._add_tab_divider = this._create_divider();
        this._is_add_tab_visible = false;
        this._is_add_button_hover = false;
        this._on_add_tab = onAddTab ?? (() => {});
        this._add_tab_button = this._create_add_tab_button();
        this.set_add_tab_visible(false);
        this._on_toggle_display_mode = onToggleDisplayMode ?? (() => {});
        this._display_mode_toggle_button = this._create_display_mode_toggle_button();
        this._ensure_divider_count();
    }

    get_display_mode_toggle_button() {
        return this._display_mode_toggle_button;
    }

    set_display_mode_icon(mode) {
        let icon = this._display_mode_toggle_button?.get_first_child();
        if (!icon)
            return;
        if (mode === 'standalone')
            icon.set_icon_name('view-restore-symbolic');
        else
            icon.set_icon_name('view-fullscreen-symbolic');
    }

    _create_display_mode_toggle_button() {
        let icon = new St.Icon({
            icon_name: 'view-fullscreen-symbolic',
            icon_size: 16,
        });
        let button = new St.Button({
            y_align: Clutter.ActorAlign.CENTER,
            child: icon,
        });
        button.add_style_class_name('app-tabs-display-mode-button');
        button.connect('clicked', () => {
            this._on_toggle_display_mode?.();
        });
        button.connect('notify::hover', () => {
            this._apply_add_button_style();
        });
        button.set_style(this._get_add_button_style());
        return button;
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
        this._tabs = null;
        this._tab_divider_pool = null;
        this._drag_placeholder = null;
        this._recent_windows_divider = null;
        this._is_recent_windows_visible = false;
        this._is_recent_windows_button_hover = false;
        this._on_show_recent_windows = null;
        this._recent_windows_button = null;
        this._add_tab_divider = null;
        this._is_add_tab_visible = false;
        this._is_add_button_hover = false;
        this._on_add_tab = null;
        this._add_tab_button = null;
        this._display_mode_toggle_button = null;
        this._on_toggle_display_mode = null;
    }

    set_theme({ isDarkMode, panelHeight }) {
        this._is_dark_mode = isDarkMode;
        this._panel_height = panelHeight;
        this._apply_divider_styles();
        this._apply_recent_windows_button_style();
        this._apply_add_button_style();
    }

    set_tabs(tabs) {
        this._tabs = tabs.slice();
        this._ensure_divider_count();
        this._layout();
        this.refresh_active_state();
    }

    get_tabs() {
        return this._tabs.slice();
    }

    add_tab(tab) {
        if (this._tabs.includes(tab))
            return;

        this.set_tabs([...this._tabs, tab]);
    }

    remove_tab(tab) {
        this.set_tabs(this._tabs.filter(current_tab => current_tab !== tab));
    }

    move_tab(tab, target_index) {
        let tabs = this._tabs.filter(current_tab => current_tab !== tab);
        let bounded_index = Math.max(0, Math.min(target_index, tabs.length));
        tabs.splice(bounded_index, 0, tab);
        this.set_tabs(tabs);
    }

    get_tab_index(tab) {
        return this._tabs.indexOf(tab);
    }

    begin_drag(tab, placeholder, target_index) {
        this._drag_placeholder = placeholder;
        this._tabs = this._tabs.filter(current_tab => current_tab !== tab);
        if (tab.get_parent() === this.actor)
            this.actor.remove_child(tab);
        this._layout();
        this.move_drag_placeholder(target_index);
        this.refresh_active_state();
    }

    move_drag_placeholder(target_index) {
        if (!this._drag_placeholder)
            return;

        let bounded_index = Math.max(0, Math.min(target_index, this._tabs.length));
        if (this._drag_placeholder.get_parent() === this.actor)
            this.actor.remove_child(this._drag_placeholder);
        let insert_at = bounded_index * 2 + 1;
        if (insert_at >= this.actor.get_children().length)
            this.actor.add_child(this._drag_placeholder);
        else
            this.actor.insert_child_at_index(this._drag_placeholder, insert_at);
    }

    get_drag_placeholder_index() {
        if (!this._drag_placeholder)
            return -1;

        let placeholder_index = this.actor.get_children().indexOf(this._drag_placeholder);
        if (placeholder_index === this.actor.get_children().length - 1)
            return this._tabs.length;

        return Math.max(0, Math.floor((placeholder_index - 1) / 2));
    }

    end_drag(tab, target_index) {
        if (this._drag_placeholder?.get_parent() === this.actor)
            this.actor.remove_child(this._drag_placeholder);
        this._drag_placeholder = null;
        this.move_tab(tab, target_index);
        tab.set_position(0, 0);
    }

    clear_drag_placeholder() {
        if (this._drag_placeholder?.get_parent())
            this._drag_placeholder.get_parent().remove_child(this._drag_placeholder);
        this._drag_placeholder = null;
    }

    refresh_active_state() {
        let divider_visibility = getDividerVisibility([
            ...this._tabs.map(tab => tab.is_focused()),
            false,
            false,
        ]);

        this._tab_divider_pool.forEach((divider, index) => {
            if (index < this._tabs.length && divider_visibility[index])
                divider.show();
            else
                divider.hide();
        });

        if (this._is_recent_windows_visible && divider_visibility[this._tabs.length])
            this._recent_windows_divider.show();
        else
            this._recent_windows_divider.hide();

        if (this._is_add_tab_visible && divider_visibility[this._tabs.length + 1])
            this._add_tab_divider.show();
        else
            this._add_tab_divider.hide();
    }

    _ensure_divider_count() {
        while (this._tab_divider_pool.length < this._tabs.length)
            this._tab_divider_pool.push(this._create_divider());
    }

    _create_divider() {
        let divider = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        divider.add_style_class_name('vertical-line');
        divider.set_style(this._get_divider_style());
        divider.hide();
        return divider;
    }

    _create_recent_windows_button() {
        let icon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 16,
        });
        let button = new St.Button({
            y_align: Clutter.ActorAlign.CENTER,
            child: icon,
        });
        button.add_style_class_name('app-tabs-recent-windows-button');
        button.connect('clicked', () => {
            this._on_show_recent_windows?.();
        });
        button.connect('notify::hover', () => {
            this._is_recent_windows_button_hover = button.hover;
            this._apply_recent_windows_button_style();
        });
        button.set_style(this._get_recent_windows_button_style());
        return button;
    }

    _create_add_tab_button() {
        let icon = new St.Icon({
            icon_name: 'list-add-symbolic',
            icon_size: 16,
        });
        let button = new St.Button({
            y_align: Clutter.ActorAlign.CENTER,
            child: icon,
        });
        button.add_style_class_name('app-tabs-add-button');
        button.connect('clicked', () => {
            this._on_add_tab?.();
        });
        button.connect('notify::hover', () => {
            this._is_add_button_hover = button.hover;
            this._apply_add_button_style();
        });
        button.set_style(this._get_add_button_style());
        return button;
    }

    get_add_tab_button() {
        return this._add_tab_button;
    }

    get_recent_windows_button() {
        return this._recent_windows_button;
    }

    get_add_tab_divider() {
        return this._add_tab_divider;
    }

    get_recent_windows_divider() {
        return this._recent_windows_divider;
    }

    set_recent_windows_visible(isVisible) {
        this._is_recent_windows_visible = isVisible;
        if (isVisible)
            this._recent_windows_button.show();
        else
            this._recent_windows_button.hide();
        this.refresh_active_state();
    }

    set_add_tab_visible(isVisible) {
        this._is_add_tab_visible = isVisible;
        if (isVisible)
            this._add_tab_button.show();
        else
            this._add_tab_button.hide();
        this.refresh_active_state();
    }

    _apply_divider_styles() {
        let style = this._get_divider_style();
        for (let divider of this._tab_divider_pool)
            divider.set_style(style);
        this._recent_windows_divider.set_style(style);
        this._add_tab_divider.set_style(style);
    }

    _get_divider_style() {
        return buildDividerStyle(this._is_dark_mode, this._panel_height);
    }

    _apply_add_button_style() {
        this._add_tab_button?.set_style(this._get_add_button_style());
    }

    _apply_recent_windows_button_style() {
        this._recent_windows_button?.set_style(this._get_recent_windows_button_style());
    }

    _get_add_button_style() {
        return buildAddButtonStyle(this._is_dark_mode, this._is_add_button_hover);
    }

    _get_recent_windows_button_style() {
        return buildAddButtonStyle(this._is_dark_mode, this._is_recent_windows_button_hover);
    }

    _layout() {
        for (let child of this.actor.get_children())
            this.actor.remove_child(child);

        for (let i = 0; i < this._tabs.length; i++) {
            this.actor.add_child(this._tab_divider_pool[i]);
            this.actor.add_child(this._tabs[i]);
        }
    }
}
