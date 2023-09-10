const GObject = imports.gi.GObject
const Me = imports.misc.extensionUtils.getCurrentExtension()
const AppTabs = Me.imports.AppTabs.AppTabs;
const Logger = Me.imports.utils.log.Logger;
const Config = Me.imports.config.Config;
const Main = imports.ui.main;

var AppTabsExtension = GObject.registerClass(
    class AppTabsExtension extends GObject.Object {
        _init() {
            this._logger = new Logger("AppTabsExtension")
            this._config = new Config();
            this._tabs = new AppTabs({config: this._config});
        }

        activate() {
            this._logger.info("enabling extension...");
            Main.panel.addToStatusArea(
                'AppTabs', this._tabs, this._config.index, this._config.side
            )
        }

        destroy() {
            this._logger.info("disabling extension...");
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
