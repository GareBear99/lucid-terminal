#!/usr/bin/env python3
# 👾 LuciferAI Autonomous Script Builder — v12.4 "Eternal Pulse"
# Fix: heartbeat draws below input, never overlaps Lucifer> prompt

import os, sys, termios, tty, threading, time, select
from lucifer_core import LuciferCore

RESET="\033[0m"; RED="\033[31m"; PURPLE="\033[35m"
CLEAR_LINE="\033[K"

RUNNING=True; USER_TYPING=False; HEART_STATE="idle"
core = LuciferCore()

def banner():
    os.system("clear")
    print("\n")
    print("╔════════════════════════════════════════════════════════╗")
    print("║ 👾  LuciferAI Autonomous Script Builder                ║")
    print("║     Self-Updating • Self-Syncing • Alive               ║")
    print("║               ☠️ Skull Dormant                          ║")
    print("╚════════════════════════════════════════════════════════╝")
    print("\n")

# ───────────────────────────── Heartbeat ───────────────────────────── #
def heartbeat():
    colors=[RED,PURPLE]; skulls=["☠️","💀"]; i=0
    while RUNNING:
        if HEART_STATE=="idle" and not USER_TYPING:
            color=colors[i%2]; skull=skulls[i%2]
            # move to next line, clear, print idle, then move back to input line
            msg=f"\0337\033[1B\r{color}🩸 Idle • Awaiting Commands... {skull}{RESET}{CLEAR_LINE}\0338"
            os.write(1, msg.encode())
            i+=1
        time.sleep(1.0)

# ───────────────────────────── Processing Animation ───────────────────────────── #
def processing():
    global HEART_STATE
    HEART_STATE="busy"
    frames=[("💀",PURPLE),("🩸",RED)]
    for _ in range(3):
        for sym,col in frames:
            os.write(1,f"\r{col}{sym} Processing...{RESET}{CLEAR_LINE}".encode())
            time.sleep(0.4)
    os.write(1,f"\r{CLEAR_LINE}".encode())
    HEART_STATE="idle"

# ───────────────────────────── Patch run output ───────────────────────────── #
if hasattr(core,"builder"):
    orig_run=core.builder.run
    def run_patched(path):
        res=orig_run(path)
        print(f"{PURPLE}✨ Run Successful: {path}{RESET}")
        return res
    core.builder.run=run_patched

# ───────────────────────────── Main Loop ───────────────────────────── #
def main():
    global USER_TYPING,RUNNING
    banner()
    print("🩸 Idle • Awaiting Commands... ☠️")
    threading.Thread(target=heartbeat,daemon=True).start()

    fd=sys.stdin.fileno()
    old=termios.tcgetattr(fd)
    tty.setcbreak(fd)

    history=[]; hist_idx=-1
    try:
        buf=""
        sys.stdout.write("Lucifer> "); sys.stdout.flush()
        while RUNNING:
            r,_,_=select.select([sys.stdin],[],[],0.05)
            if r:
                ch=sys.stdin.read(1)
                USER_TYPING=True

                if ch in ("\n","\r"):
                    cmd=buf.strip(); buf=""; USER_TYPING=False
                    sys.stdout.write("\n"); sys.stdout.flush()
                    if cmd:
                        history.append(cmd); hist_idx=len(history)
                        parts=cmd.split(); c=parts[0]; args=parts[1:]
                        if c.lower() in ("exit","quit"):
                            processing(); print("\n👋 Farewell, mortal.")
                            RUNNING=False; break
                        processing()
                        core.handle_command(c,args)
                    sys.stdout.write("Lucifer> "); sys.stdout.flush()

                elif ch=="\x7f":
                    if buf: buf=buf[:-1]; sys.stdout.write("\b \b"); sys.stdout.flush()

                elif ch=="\x1b":
                    nxt=sys.stdin.read(2)
                    if nxt=="[A" and history:
                        hist_idx=max(0,hist_idx-1)
                        buf=history[hist_idx]
                        sys.stdout.write(f"\rLucifer> {buf}{CLEAR_LINE}")
                        sys.stdout.flush()
                else:
                    buf+=ch; sys.stdout.write(ch); sys.stdout.flush()
            else:
                USER_TYPING=False

    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        RUNNING=False

if __name__=="__main__":
    main()
