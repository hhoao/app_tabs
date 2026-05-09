import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Logger from './src/utils/Logger.js';
import Config from './src/config/Config.js';
import { TabPanel } from './src/TabPanel.js';


export const getExtensionObject = () => globalThis.DockerContainersExtension;
export default class AppTabsExtension extends Extension {
    enable() {
        globalThis.DockerContainersExtension = this;
        this._logger = new Logger("AppTabsExtension")
        this._config = new Config();
        this._settings = this.getSettings();
        this._tabs = new TabPanel(
            {
                config: this._config,
                settings: this._settings
            });
        this._logger.info("Enabling extension...");
        // TabPanel self-initializes standalone mode in its constructor.
        // Only add to panel status area when in panel mode.
        if (this._settings.get_string('display-mode') === 'panel') {
            Main.panel.addToStatusArea(
                'AppTabs', this._tabs, this._config.index, this._config.side
            );
        }
    }

    disable() {
        delete globalThis.DockerContainersExtension;
        this._logger.info("Disabling extension...");
        this._logger = null;
        this._config = null;
        this._tabs.destroy();
        this._tabs = null;
        this._settings = null;
    }
}
