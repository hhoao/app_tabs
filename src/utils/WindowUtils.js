import Gio from 'gi://Gio';
import * as StringUtils from './StringUtils.js';

function formatProcessInfo(obj, indent = 0) {
    const indentSpace = '  '.repeat(indent);
    let output = '';
    for (let key in obj) {
        if (key === 'net') {
            output += `${indentSpace}=== ${key} ===\n`;
            output += JSON.stringify(obj[key], null, 2);
        } else {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                output += `${indentSpace}=== ${key} ===\n`;
                output += formatProcessInfo(obj[key], indent + 1);
            } else {
                output += `${indentSpace}=== ${key} ===\n`;
                output += `${indentSpace}${obj[key]}\n`;
            }
        }
        output += '\n';
    }
    return output;
}

function readProcFile(pid, filename) {
    try {
        let file = Gio.File.new_for_path(`/proc/${pid}/${filename}`);
        let [ok, contents] = file.load_contents(null);
        if (ok) {
            return StringUtils.readString(contents);
        }
    } catch (e) {
        log(`Error reading /proc/${pid}/${filename}: ${e}`);
    }
    return null;
}

function parseHexIpAndPort(hexString) {
    let [ipHex, portHex] = hexString.split(':');

    let ip = ipHex.match(/../g)
        .reverse()
        .map(byte => parseInt(byte, 16))
        .join('.');

    let port = parseInt(portHex, 16);

    return { ip, port };
}

function parseNetworkInfo(pid, filename) {
    let content = readProcFile(pid, `net/${filename}`);
    if (!content) return null;

    let lines = content.split('\n');
    let connections = [];
    for (let line of lines) {
        let fields = line.trim().split(/\s+/);
        if (fields.length > 1) {
            let localAddress = parseHexIpAndPort(fields[1]);
            let remoteAddress = parseHexIpAndPort(fields[2]);
            connections.push({
                local: localAddress,
                remote: remoteAddress,
                state: fields[3],
            });
        }
    }
    return connections;
}

function getFileDescriptorCount(pid) {
    const fdPath = `/proc/${pid}/fd`;
    try {
        const directory = Gio.File.new_for_path(fdPath);
        const enumerator = directory.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let count = 0;

        while (enumerator.next_file(null)) {
            count++;
        }
        return count;
    } catch (error) {
        log(`Failed to get file descriptors for PID ${pid}: ${error}`);
        return -1;
    }
}

export function getProcessInfo(pid) {
    let result = {};

    const basicFiles = [
        'status', 'cmdline', 'environ', 'stat', 'comm', 'io', 'statm', 'cgroup', 'limits', 'sched',
    ];
    for (let file of basicFiles) {
        let content = readProcFile(pid, file);
        if (content) {
            result[file] = content;
        }
    }

    if (result['cmdline']) {
        result['cmdline'] = result['cmdline'].replace(/\0+/g, '\n');
    }
    if (result['environ']) {
        result['environ'] = result['environ'].replace(/\0+/g, '\n');
    }

    try {
        let cwd = GLib.file_read_link(`/proc/${pid}/cwd`);
        let exe = GLib.file_read_link(`/proc/${pid}/exe`);
        if (cwd) result['cwd_real'] = cwd;
        if (exe) result['exe_real'] = exe;
    } catch (e) {
        log(`Error reading symbolic links for PID ${pid}: ${e}`);
    }

    result['net'] = {
        tcp: parseNetworkInfo(pid, 'tcp'),
        udp: parseNetworkInfo(pid, 'udp'),
    };

    result['fd'] = getFileDescriptorCount(pid);

    return formatProcessInfo(result, 0);
}
