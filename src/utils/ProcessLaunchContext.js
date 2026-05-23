import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

export function parseCmdlineBytes(bytes) {
    let text = new TextDecoder().decode(bytes);
    return text.split('\0').filter(value => value.length > 0);
}

function argvHasRestoreTarget(argv) {
    return argv.some((arg, index) => {
        if (index === 0)
            return false;

        return arg.startsWith('/') ||
            arg.startsWith('file://') ||
            arg === '.' ||
            arg === '..' ||
            arg === '--folder-uri' ||
            arg === '--file-uri' ||
            arg.startsWith('--folder-uri=') ||
            arg.startsWith('--file-uri=');
    });
}

export function shouldUseCommandForRestore(argv) {
    if (!Array.isArray(argv) || argv.length === 0)
        return false;

    if (argv.some(arg => String(arg).startsWith('--type=')))
        return false;

    return argvHasRestoreTarget(argv);
}

async function readProcBytes(pid, filename) {
    let file = Gio.File.new_for_path(`/proc/${pid}/${filename}`);
    let [contents] = await file.load_contents_async(null);
    return contents;
}

function readProcLink(pid, filename) {
    try {
        return GLib.file_read_link(`/proc/${pid}/${filename}`);
    } catch (_e) {
        return '';
    }
}

export async function getProcessLaunchContext(pid) {
    try {
        if (!pid || pid <= 0)
            return { command: null, cwd: '' };

        let contents = await readProcBytes(pid, 'cmdline');
        let command = parseCmdlineBytes(contents);
        return {
            command: command.length ? command : null,
            cwd: readProcLink(pid, 'cwd'),
        };
    } catch (_e) {
        return { command: null, cwd: '' };
    }
}
