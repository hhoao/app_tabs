var Logger = class AppTabs {
    constructor(id) {
        this._id = id;
        this._message_prefix =`[Extension][AppTabs][${this._id}]`;
    }
    info(str) {
        console.log(`${this._message_prefix}[INFO] ${str}`);
    }

    debug(str) {
        console.debug(`${this._message_prefix}[DEBUG] ${str}`);
    }

    warn(str) {
        console.warn(`${this._message_prefix}[WARN] ${str}`);
    }

    error(str) {
        console.error(`${this._message_prefix}[ERROR] ${str}`);
    }
}
