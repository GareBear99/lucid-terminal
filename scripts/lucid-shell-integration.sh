#!/bin/sh
# Lucid shell integration — OPT-IN (heavy terminal work, 2026-11-13).
#
# Install (by hand — Lucid NEVER installs this for you and never
# touches your shell config):
#   echo 'source /path/to/lucid-terminal/scripts/lucid-shell-integration.sh' >> ~/.zshrc
#   # or ~/.bashrc for bash, then restart the shell.
# Uninstall: delete that line.
#
# What it does — ONE thing: after every command, it emits a single
# OSC 133 `D` sequence carrying that command's exit code, so
# Lucid's block headers can show it (Warp's headers carry the
# exit code; Lucid's could not — the code lives only inside the
# shell, and reading it any other way means wrapping your command
# or parsing your prompt, both forbidden). Without this script
# installed, no sequence ever arrives and Lucid shows no exit
# code — never faked, never guessed.
#
# What it does NOT do: no prompt changes, no aliases, no history
# changes, no `PROMPT_COMMAND`/`precmd` replacement — it prepends
# (bash) or hooks (zsh) so your existing prompt setup keeps
# working exactly as it was. The exit code is read FIRST, before
# any other prompt hook runs, so it is always the command's own.
#
# The sequence uses the ST terminator (ESC backslash), not BEL:
# Lucid's bell processor strips BEL from every PTY chunk, so a
# BEL-terminated sequence would arrive with its terminator eaten.
# The sequence is invisible in the terminal (OSC sequences never
# print) and stripped from Lucid's block transcripts.
#
# zsh and bash only. Sourcing it in any other shell is a silent
# no-op — it defines nothing and errors nowhere.

# The hook: print one OSC 133 D sequence with $? — the exit code
# of the command that just ran. $? must be read FIRST: any command
# before it (including an echo) would overwrite it.
_lucid_osc133_d() {
  printf '\033]133;D;%s\033\\' "$?"
}

if [ -n "$ZSH_VERSION" ]; then
  # zsh: append to precmd_functions (the prompt hook list). The
  # array may not exist yet — assigning to it creates it.
  if [ -z "${precmd_functions[(r)_lucid_osc133_d]}" ]; then
    precmd_functions+=(_lucid_osc133_d)
  fi
elif [ -n "$BASH_VERSION" ]; then
  # bash: prepend to PROMPT_COMMAND so $? is read before any
  # other prompt command runs. PROMPT_COMMAND may be unset.
  case " ${PROMPT_COMMAND} " in
    *"_lucid_osc133_d"*) ;;
    *) PROMPT_COMMAND="_lucid_osc133_d${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
  esac
fi
