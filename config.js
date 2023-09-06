var Config = class Config {
    constructor() {
        this.style_config = {
            'active-background': '#4b4b4b',
            max_tabs_width: 300,
            max_tab_width: 100,
            default_tab_style: {
                'margin': '2px 0',
                'border-radius': '8px',
                'border': '0',
                'border-left': '1px',
                'border-right': '1px',
                'overflow': 'hidden',
                'text-overflow': 'clip',
            },
        }
    }

    get_style_config() {
        return this.style_config;
    }
}
