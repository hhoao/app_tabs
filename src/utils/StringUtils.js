const decoder = new TextDecoder();

export function readString(str) {
    try {
        return decoder.decode(str);
    } catch (error) {
        console.error('Decoding failed:', error);
        return str.toString();
    }
}
