const GETTEXT_DOMAIN = 'app-tabs-extension';

const ExtensionUtils = imports.misc.extensionUtils;
const Me            = imports.misc.extensionUtils.getCurrentExtension()
const AppTabs = Me.imports.AppTabs.AppTabs;
const Logger = Me.imports.utils.log.Logger;

class Extension {
    static logger = new Logger(Extension.name)
    constructor(uuid) {
        this._uuid = uuid;
        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        Extension.logger.info("enabling extension...");
        this._tabs = new AppTabs()
        this._tabs.enable(this._uuid);
    }

    disable() {
        Extension.logger.info("disabling extension...");
        this._tabs.destroy();
        this._tabs = null;
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
