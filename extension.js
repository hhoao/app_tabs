const GETTEXT_DOMAIN = 'app-tabs-extension';

const ExtensionUtils = imports.misc.extensionUtils;
const Me            = imports.misc.extensionUtils.getCurrentExtension()
const AppTabs = Me.imports.AppTabs.AppTabs;

class Extension {
    constructor(uuid) {
        this._uuid = uuid;
        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this._log("enabling extension...");
        this._tabs = new AppTabs()
        this._tabs.enable(this._uuid);
    }

    disable() {
        this._log("disabling extension...");
        this._tabs.destroy();
        this._tabs = null;
    }

    _log(str) {
        log(`[Extension][AppTabs] ${str}`);
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
