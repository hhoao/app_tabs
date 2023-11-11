export default class Config {
    constructor() {
        this.style_config = {
            'active-background': '#4b4b4b',
            max_tabs_width: 300,
            max_tab_width: 100,
            default_tab_style: {
                'border-radius': '8px',
                'margin-left': '2px',
            },
        }
        this.tab_panel_config = {
            default_initial_tabs_count: 4,
        }
        this.side = 'left';
        this.index = 10;
    }
}
