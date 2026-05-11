import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SchemaKeyConstants } from '../src/config/SchemaKeyConstants.js';

const DEFAULT_POSITION = '{"x":0,"y":0}';
const DEFAULT_BAR_WIDTH = 200;
const DEFAULT_BAR_HEIGHT = 30;

export const FloatingBar = GObject.registerClass({}, class FloatingBar extends St.BoxLayout {
    _init({ tabPanel, settings }) {
        super._init({
            reactive: true,
            style_class: 'app-tabs-floating-bar',
            x_expand: false,
        });
        this._tabPanel = tabPanel;
        this._settings = settings;
        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._barStartX = 0;
        this._barStartY = 0;
        this._using_default_position = true;
        this._position_later_id = 0;
        this._allocation_changed_id = 0;
        this._drag_handle = this._create_drag_handle();
        this.add_child(this._drag_handle);

        this.connect('button-press-event', (actor, event) => {
            if (event.get_source() !== this)
                return Clutter.EVENT_PROPAGATE;
            this._begin_drag(event);
            return Clutter.EVENT_STOP;
        });
    }

    _create_drag_handle() {
        let icon = new St.Icon({
            icon_name: 'view-more-symbolic',
            icon_size: 16,
        });
        let button = new St.Button({
            y_align: Clutter.ActorAlign.CENTER,
            child: icon,
            style_class: 'app-tabs-floating-drag-handle',
        });
        this._drag_handle = button;
        this._drag_handle.connect('button-press-event', (_actor, event) => {
            this._begin_drag(event);
            return Clutter.EVENT_STOP;
        });
        return button;
    }

    _begin_drag(event) {
        if (this._dragging)
            return;
        this._using_default_position = false;
        this._dragging = true;
        let [stageX, stageY] = event.get_coords();
        this._dragStartX = stageX;
        this._dragStartY = stageY;
        this._barStartX = this.x;
        this._barStartY = this.y;

        this._motionId = global.stage.connect('motion-event', (_actor, ev) => {
            let [mx, my] = ev.get_coords();
            let newX = this._barStartX + (mx - this._dragStartX);
            let newY = this._barStartY + (my - this._dragStartY);

            let position = this._clamp_position({ x: newX, y: newY });

            this.set_position(position.x, position.y);
            return Clutter.EVENT_STOP;
        });

        this._releaseId = global.stage.connect('button-release-event', () => {
            this._end_drag();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _get_primary_monitor_geometry() {
        let monitor = Main.layoutManager.primaryMonitor;
        if (monitor?.width !== undefined && monitor?.height !== undefined)
            return monitor;

        let monitorIndex = global.display.get_primary_monitor();
        return global.display.get_monitor_geometry(monitorIndex);
    }

    _queue_position_update() {
        if (this._position_later_id)
            return;

        this._position_later_id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._position_later_id = 0;
            this._update_position_for_current_mode();
            return GLib.SOURCE_REMOVE;
        });
    }

    _update_position_for_current_mode() {
        if (!this.get_parent())
            return;

        let position;
        if (!this._using_default_position)
            position = this._clamp_position({ x: this.x, y: this.y });
        else
            position = this._get_centered_position();

        this.set_position(position.x, position.y);
    }

    _get_centered_position() {
        let monitor = this._get_primary_monitor_geometry();
        let panelHeight = Main.panel?.get_height?.() ?? Main.panel?.height ?? DEFAULT_BAR_HEIGHT;
        let width = Math.max(this.width || DEFAULT_BAR_WIDTH, DEFAULT_BAR_WIDTH);
        return this._clamp_position({
            x: monitor.x + Math.max(0, Math.floor((monitor.width - width) / 2)),
            y: monitor.y + panelHeight + 4,
        });
    }

    _clamp_position(position) {
        let monitor = this._get_primary_monitor_geometry();
        let width = Math.max(this.width || DEFAULT_BAR_WIDTH, DEFAULT_BAR_WIDTH);
        let height = Math.max(this.height || DEFAULT_BAR_HEIGHT, DEFAULT_BAR_HEIGHT);
        let maxX = monitor.x + Math.max(0, monitor.width - width);
        let maxY = monitor.y + Math.max(0, monitor.height - height);
        return {
            x: Math.round(Math.max(monitor.x, Math.min(position.x, maxX))),
            y: Math.round(Math.max(monitor.y, Math.min(position.y, maxY))),
        };
    }

    _save_position() {
        let pos = JSON.stringify({ x: this.x, y: this.y });
        this._settings.set_string(SchemaKeyConstants.STANDALONE_BAR_POSITION, pos);
    }

    _end_drag() {
        this._dragging = false;
        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = null;
        }
        if (this._releaseId) {
            global.stage.disconnect(this._releaseId);
            this._releaseId = null;
        }
        this._save_position();
    }

    attach() {
        Main.uiGroup.add_child(this);
        this.opacity = 0;
        this.show();

        let posStr = this._settings.get_string(SchemaKeyConstants.STANDALONE_BAR_POSITION);
        let pos = { x: 0, y: 0 };
        try {
            pos = JSON.parse(posStr);
        } catch (_e) { /* use defaults */ }

        this._using_default_position = posStr === DEFAULT_POSITION;
        if (this._allocation_changed_id)
            this.disconnect(this._allocation_changed_id);
        this._allocation_changed_id = this.connect('notify::allocation', () => {
            this._queue_position_update();
        });
        if (this._using_default_position)
            this._queue_position_update();
        else {
            pos = this._clamp_position(pos);
            this.set_position(pos.x, pos.y);
        }

        this.remove_transition('opacity');
        this.ease({
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    detach() {
        if (!this._using_default_position)
            this._save_position();

        if (this._position_later_id) {
            GLib.Source.remove(this._position_later_id);
            this._position_later_id = 0;
        }
        if (this._allocation_changed_id) {
            this.disconnect(this._allocation_changed_id);
            this._allocation_changed_id = 0;
        }

        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = null;
        }
        if (this._releaseId) {
            global.stage.disconnect(this._releaseId);
            this._releaseId = null;
        }

        this._dragging = false;

        if (this.get_parent())
            this.get_parent().remove_child(this);
    }

    destroy() {
        if (this._position_later_id) {
            GLib.Source.remove(this._position_later_id);
            this._position_later_id = 0;
        }
        if (this._allocation_changed_id) {
            this.disconnect(this._allocation_changed_id);
            this._allocation_changed_id = 0;
        }
        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = null;
        }
        if (this._releaseId) {
            global.stage.disconnect(this._releaseId);
            this._releaseId = null;
        }
        this._drag_handle?.destroy();
        this._drag_handle = null;
        this._tabPanel = null;
        this._settings = null;
        super.destroy();
    }
});
