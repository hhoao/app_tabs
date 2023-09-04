const GObject       = imports.gi.GObject
const Me = imports.misc.extensionUtils.getCurrentExtension()
const AppTabs = Me.imports.AppTabs.AppTabs;

var AppTabsExtension = GObject.registerClass(
    class AppTabsExtension extends GObject.Object {
        _init() {
            this._tabs = new AppTabs()
        }
        activate() {
            log("enabling extension...");

            this._tabs.enable(this._uuid);
        }

        destroy() {
            log("disabling extension...");
            this._tabs.destroy();
        }
    }
)

function enable() {
    global.app_tabs = new AppTabsExtension();
    global.app_tabs.activate()
}

function disable() {
    global.app_tabs.destroy()
    global.app_tabs = null
}
