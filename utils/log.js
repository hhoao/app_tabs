var Logger = class AppTabs {
    constructor(id) {
        this._id = id;
        this._message_prefix =`[Extension][AppTabs][${this._id}]`;
    }
    info(str) {
        log(`${this._message_prefix}[INFO] ${str}`);
    }

    debug(str) {
        log(`${this._message_prefix}[DEBUG] ${str}`);
    }

    warn(str) {
        log(`${this._message_prefix}[WARN] ${str}`);
    }

    error(str) {
        log(`${this._message_prefix}[ERROR] ${str}`);
    }
}
