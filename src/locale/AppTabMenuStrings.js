import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * 标签右键菜单文案（集中供 xgettext 提取；请保持与 AppTab._initMenu 一致）。
 */
export const AppTabMenuStrings = {
    get activate() {
        return _('Activate');
    },
    get hide() {
        return _('Hide');
    },
    get maximize() {
        return _('Maximize');
    },
    get unmaximize() {
        return _('Unmaximize');
    },
    get pin() {
        return _('Pin');
    },
    get unpin() {
        return _('Unpin');
    },
    get decorate() {
        return _('Decorate');
    },
    get undecorate() {
        return _('Undecorate');
    },
    get moveLeft() {
        return _('Move left ←');
    },
    get moveRight() {
        return _('Move right →');
    },
    get copyProcessInformation() {
        return _('Copy process information');
    },
    get closeOtherTabs() {
        return _('Close other tabs');
    },
    get closeTabsToTheRight() {
        return _('Close tabs to the right');
    },
    get close() {
        return _('Close');
    },
    get forceKillDangerous() {
        return _('Force kill (dangerous)');
    },
};
