/** React and native keyboard events both expose the IME's ownership of a key. */
export function isImeComposing(event: {
    nativeEvent?: { isComposing?: boolean; keyCode?: number };
    isComposing?: boolean;
    keyCode?: number;
}): boolean {
    const native = event.nativeEvent ?? event;
    return native.isComposing === true || native.keyCode === 229;
}
