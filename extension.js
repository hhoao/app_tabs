import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Logger from './utils/Logger.js';
import Config from './Config.js';
import * as AppTabs from './AppTabs.js';

export default class AppTabsExtension extends Extension {
    enable() {
        this._logger = new Logger("AppTabsExtension")
        this._config = new Config();
        this._tabs = new AppTabs.AppTabs({config: this._config});
        this._logger.info("enabling extension...");
        Main.panel.addToStatusArea(
            'AppTabs', this._tabs, this._config.index, this._config.side
        )
    }

    disable() {
        this._logger.info("disabling extension...");
        this._tabs.destroy();
    }
}
