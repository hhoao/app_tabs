import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { getDividerVisibility } from './utils/DividerVisibility.js';
import { buildDividerStyle } from './utils/ThemeStyle.js';

export class TabControls {
    constructor({ isDarkMode, panelHeight }) {
        this.actor = new St.BoxLayout({ style_class: 'app-tabs-box' });
        this._tabs = [];
        this._tab_divider_pool = [];
        this._drag_placeholder = null;
        this._is_dark_mode = isDarkMode;
        this._panel_height = panelHeight;
        this._ensure_divider_count();
    }

    destroy() {
        this.actor.destroy();
        this.actor = null;
        this._tabs = null;
        this._tab_divider_pool = null;
        this._drag_placeholder = null;
    }

    set_theme({ isDarkMode, panelHeight }) {
        this._is_dark_mode = isDarkMode;
        this._panel_height = panelHeight;
        this._apply_divider_styles();
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
        let divider_visibility = getDividerVisibility(this._tabs.map(tab => tab.is_focused()));

        this._tab_divider_pool.forEach((divider, index) => {
            if (divider_visibility[index])
                divider.show();
            else
                divider.hide();
        });
    }

    _ensure_divider_count() {
        while (this._tab_divider_pool.length < this._tabs.length + 1)
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

    _apply_divider_styles() {
        let style = this._get_divider_style();
        for (let divider of this._tab_divider_pool)
            divider.set_style(style);
    }

    _get_divider_style() {
        return buildDividerStyle(this._is_dark_mode, this._panel_height);
    }

    _layout() {
        for (let child of this.actor.get_children())
            this.actor.remove_child(child);

        for (let i = 0; i < this._tabs.length; i++) {
            this.actor.add_child(this._tab_divider_pool[i]);
            this.actor.add_child(this._tabs[i]);
        }
        this.actor.add_child(this._tab_divider_pool[this._tabs.length]);
    }
}
