const { Gio } = imports.gi;
const THREAD_ID = `${Math.floor(Math.random() * 1000)}-${Date.now()}`;
// const settings = new Gio.Settings({ schema: 'lock' });
// const setItem = settings.set_string.bind(settings);
// const getItem = settings.get_string.bind(settings);
// const removeItem = settings.unset.bind(settings);

const setItem = (key, value) => global.key = value;
const getItem = (key) => global.key;
const removeItem = (key) => global.key = null;

const nextTick = fn => setTimeout(fn, 0);

var Mutex = class Mutex {
    constructor (key) {
        this.keyX = `mutex_key_${key}_X`;
        this.keyY = `mutex_key_${key}_Y`;
    }

    lock() {
        return new Promise((resolve, reject) => {
            const fn = () => {
                setItem(this.keyX, THREAD_ID);
                if (!getItem(this.keyY) === null) {
                    nextTick(fn); // restart
                }
                setItem(this.keyY, THREAD_ID);
                if (getItem(this.keyX) !== THREAD_ID) {
                    //delay
                    setTimeout(() => {
                        if (getItem(this.keyY) !== THREAD_ID) {
                            nextTick(fn) // restart
                            return;
                        }
                        // critical section
                        resolve();
                        removeItem(this.keyY);
                    }, 10);
                } else {
                    resolve();
                    removeItem(this.keyY);
                }
            };

            fn();
        });
    }
}
