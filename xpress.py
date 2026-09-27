#!/usr/bin/env python3
"""
Press keys via XTest extension so Dolphin's XQueryKeymap polling detects them.
Usage: python3 xpress.py <key1> [key2...] [--hold <seconds>]
Example: python3 xpress.py Return space --hold 2
"""
import sys
import os
import time
from Xlib import X, display, XK
from Xlib.ext import xtest

def main():
    keys = []
    hold = 1.0
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '--hold':
            hold = float(sys.argv[i + 1])
            i += 2
        else:
            keys.append(sys.argv[i])
            i += 1

    d = display.Display(os.environ.get('DISPLAY', ':99'))
    
    keycodes = []
    for key_name in keys:
        keysym = XK.string_to_keysym(key_name)
        if keysym == 0:
            print(f"Unknown key: {key_name}")
            sys.exit(1)
        keycode = d.keysym_to_keycode(keysym)
        keycodes.append(keycode)
        print(f"Key '{key_name}' -> keysym {keysym} -> keycode {keycode}")

    # Press all keys down
    for kc in keycodes:
        xtest.fake_input(d, X.KeyPress, kc)
    d.sync()
    print(f"Keys pressed, holding for {hold}s...")

    time.sleep(hold)

    # Release all keys
    for kc in keycodes:
        xtest.fake_input(d, X.KeyRelease, kc)
    d.sync()
    print("Keys released.")

if __name__ == '__main__':
    main()
