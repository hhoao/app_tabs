const ConnectHelper = class ConnectHelper {
    constructor() {
        this._custom_id_handler_id_map = new Map
    }
    set_handler_id_with_custom_id(custom_id, handler_id) {
        this._custom_id_handler_id_map.set(custom_id, handler_id);
    }

    get_handler_id_by_custom_id(custom_id, handler_id) {
        return this._custom_id_handler_id_map.get(custom_id);
    }
}
