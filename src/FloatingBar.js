import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SchemaKeyConstants } from '../src/config/SchemaKeyConstants.js';

export const FloatingBar = GObject.registerClass({}, class FloatingBar extends St.BoxLayout {
    _init({ tabPanel, settings }) {
        super._init({
            reactive: true,
            style_class: 'app-tabs-floating-bar',
        });
        this._tabPanel = tabPanel;
        this._settings = settings;
        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._barStartX = 0;
        this._barStartY = 0;

        this.connect('button-press-event', (actor, event) => {
            if (event.get_source() !== this)
                return Clutter.EVENT_PROPAGATE;
            this._begin_drag(event);
            return Clutter.EVENT_STOP;
        });
    }

    _begin_drag(event) {
        if (this._dragging)
            return;
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

            let monitor = global.display.get_primary_monitor();
            let geom = monitor.get_geometry();
            newX = Math.max(0, Math.min(newX, geom.width - this.width));
            newY = Math.max(0, Math.min(newY, geom.height - this.height));

            this.set_position(Math.round(newX), Math.round(newY));
            return Clutter.EVENT_STOP;
        });

        this._releaseId = global.stage.connect('button-release-event', () => {
            this._end_drag();
            return Clutter.EVENT_PROPAGATE;
        });
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
        let pos = JSON.stringify({ x: this.x, y: this.y });
        this._settings.set_string(SchemaKeyConstants.STANDALONE_BAR_POSITION, pos);
    }

    attach() {
        let posStr = this._settings.get_string(SchemaKeyConstants.STANDALONE_BAR_POSITION);
        let pos = { x: 0, y: 0 };
        try {
            pos = JSON.parse(posStr);
        } catch (_e) { /* use defaults */ }

        let monitor = global.display.get_primary_monitor();
        let geom = monitor.get_geometry();
        pos.x = Math.max(0, Math.min(pos.x, geom.width - 200));
        pos.y = Math.max(0, Math.min(pos.y, geom.height - 40));

        this.set_position(pos.x, pos.y);
        Main.uiGroup.add_child(this);
    }

    detach() {
        let pos = JSON.stringify({ x: this.x, y: this.y });
        this._settings.set_string(SchemaKeyConstants.STANDALONE_BAR_POSITION, pos);

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
        if (this._motionId) {
            global.stage.disconnect(this._motionId);
            this._motionId = null;
        }
        if (this._releaseId) {
            global.stage.disconnect(this._releaseId);
            this._releaseId = null;
        }
        this._tabPanel = null;
        this._settings = null;
        super.destroy();
    }
});
