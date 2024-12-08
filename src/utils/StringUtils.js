
export function readString(str) {
    try {
        const decoder = new TextDecoder();
        return decoder.decode(str);
    } catch (error) {
        console.error('Decoding failed:', error);
        return str.toString();
    }
}
