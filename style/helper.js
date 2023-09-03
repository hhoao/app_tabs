var StyleHelper = class StyleHelper {
    static add_style(actor, add_style) {
        let style = actor.get_style();
        actor.set_style(style ? style : '' + add_style);
    }
    static setStyle(actor, set_style) {
        let style = actor.get_style();
        let styles= style.split(';').map((split_style)=>split_style.trim());
        new Map(styles);
    }
}
